#!/usr/bin/env python3
import argparse, hashlib, html, json, re, time, urllib.parse, urllib.request, xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

UA='SystemMaster-LiteraryDeepResearch/1.0 (private rights-aware metadata research)'
ALLOWED={'www.open.edu','open.edu','editors.ca','www.editors.ca','www.gutenberg.org','gutenberg.org','standardebooks.org','www.standardebooks.org','api.openalex.org','api.crossref.org'}

def nth_sunday(year,month,n):
    first=date(year,month,1); delta=(6-first.weekday())%7
    return date(year,month,1+delta+7*(n-1))

def eastern_offset_hours(d):
    return -4 if nth_sunday(d.year,3,2) <= d < nth_sunday(d.year,11,1) else -5

def now_ny():
    u=datetime.now(timezone.utc); return u+timedelta(hours=eastern_offset_hours(u.date()))

def assert_url(url):
    u=urllib.parse.urlparse(url)
    if u.scheme!='https' or not u.hostname or u.hostname.lower() not in ALLOWED: raise ValueError(f'URL_NOT_ALLOWED:{url}')

class SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        assert_url(newurl); return super().redirect_request(req,fp,code,msg,headers,newurl)
OPENER=urllib.request.build_opener(SafeRedirect())

def fetch(url,max_bytes=2_000_000,timeout=25):
    assert_url(url)
    req=urllib.request.Request(url,headers={'User-Agent':UA,'Accept':'application/json, application/atom+xml, application/xml, text/html;q=0.8, */*;q=0.4'})
    with OPENER.open(req,timeout=timeout) as r:
        assert_url(r.geturl()); body=r.read(max_bytes+1)
        if len(body)>max_bytes: body=body[:max_bytes]
        return {'status':getattr(r,'status',200),'content_type':r.headers.get('Content-Type',''),'final_url':r.geturl(),'body':body}

def append(path,obj):
    with path.open('a',encoding='utf-8') as f: f.write(json.dumps(obj,ensure_ascii=False,separators=(',',':'))+'\n')

def norm(s): return re.sub(r'[^a-z0-9]+',' ',(s or '').lower()).strip()
def clean_html(b):
    s=b.decode('utf-8','ignore'); s=re.sub(r'<script.*?</script>|<style.*?</style>',' ',s,flags=re.I|re.S); s=re.sub(r'<[^>]+>',' ',s); return html.unescape(re.sub(r'\s+',' ',s)).strip()
def title_html(b):
    s=b.decode('utf-8','ignore'); m=re.search(r'<title[^>]*>(.*?)</title>',s,re.I|re.S); return html.unescape(re.sub(r'\s+',' ',m.group(1)).strip()) if m else None
def rights_signals(text):
    out=[]; low=text.lower()
    for p in ['creative commons','cc by','cc0','public domain','copyright','license','licence','terms of use']:
        i=low.find(p)
        if i>=0: out.append(text[max(0,i-140):min(len(text),i+360)])
    return out[:5]
def expand_queries(seed):
    qs=[]
    for topic in seed['topics']:
        qs.append(topic)
        for lens in seed['lenses']: qs.append(f'{topic} {lens}')
    return list(dict.fromkeys(qs))
def key_for(doi,identifier,title): return (doi or identifier or norm(title) or '').lower()

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--seeds',required=True); ap.add_argument('--output',required=True); ap.add_argument('--budget-seconds',type=int); ap.add_argument('--plan-only',action='store_true'); args=ap.parse_args()
    seed=json.loads(Path(args.seeds).read_text(encoding='utf-8')); out=Path(args.output); out.mkdir(parents=True,exist_ok=True)
    budget=min(args.budget_seconds or int(seed.get('budget_seconds',1320)),1320); queries=expand_queries(seed); active=seed['active_date_new_york']; n=now_ny()
    plan={'qualification_id':'LITERARY-RESEARCH-OVERNIGHT-DEEP-HARVEST','active_date_new_york':active,'query_count':len(queries),'pages_per_query':seed['pages_per_query'],'per_page':seed['per_page'],'budget_seconds':budget,'curated_source_count':len(seed['curated_sources']),'full_text_acquisition':False,'raw_article_or_book_bodies_persisted':False,'allowed_hosts':sorted(ALLOWED)}
    (out/'plan.json').write_text(json.dumps(plan,indent=2)+'\n',encoding='utf-8')
    if args.plan_only:
        (out/'harvest_summary.json').write_text(json.dumps({**plan,'standing':'PREQUALIFIED_PLAN_ONLY'},indent=2)+'\n'); print('LITERARY_DEEP_HARVEST_PLAN=PASS'); return
    if n.date().isoformat()!=active or not (0 <= n.hour < 7):
        (out/'harvest_summary.json').write_text(json.dumps({**plan,'standing':'NO_OP_OUTSIDE_AUTHORIZED_WINDOW','observed_new_york_time':n.isoformat()},indent=2)+'\n'); print('LITERARY_DEEP_HARVEST=NO_OP_OUTSIDE_WINDOW'); return
    start=time.monotonic(); deadline=start+budget; requests=0; failures=0; stop='EXHAUSTED'; seen_oa=set(); seen_cr=set(); oa_count=0; cr_count=0; curated_count=0
    log=out/'request_log.jsonl'; qhits=out/'query_hits.jsonl'
    def time_ok():
        nonlocal stop
        if time.monotonic()>=deadline: stop='BUDGET_REACHED'; return False
        current=now_ny()
        if current.date().isoformat()!=active or current.hour>=7: stop='WINDOW_CLOSED'; return False
        return True
    def pause(): time.sleep(float(seed.get('request_delay_seconds',0.8)))
    for src in seed['curated_sources']:
        if not time_ok(): break
        rec={'kind':'CURATED_SOURCE','category':src['category'],'seed_title':src['title'],'url':src['url'],'fetched_at':datetime.now(timezone.utc).isoformat()}
        try:
            r=fetch(src['url']); requests+=1; rec.update({'http_status':r['status'],'final_url':r['final_url'],'content_type':r['content_type'],'payload_sha256':hashlib.sha256(r['body']).hexdigest()})
            if 'html' in r['content_type'].lower():
                t=clean_html(r['body']); rec['page_title']=title_html(r['body']); rec['rights_license_signals']=rights_signals(t)
            else:
                try:
                    root=ET.fromstring(r['body']); entries=[]
                    for e in root.iter():
                        if e.tag.endswith('entry'):
                            title=next((x.text for x in e if x.tag.endswith('title') and x.text),None); eid=next((x.text for x in e if x.tag.endswith('id') and x.text),None)
                            if title: entries.append({'title':title,'id':eid})
                            if len(entries)>=1000: break
                    rec['opds_entries']=entries
                except Exception as exc: rec['parse_error']=repr(exc)
            curated_count+=1
        except Exception as exc: rec['error']=repr(exc); failures+=1
        append(out/'curated_sources.jsonl',rec); append(log,{'url':src['url'],'ok':'error' not in rec,'at':datetime.now(timezone.utc).isoformat()}); pause()
    for q in queries:
        if not time_ok(): break
        for page in range(1,int(seed['pages_per_query'])+1):
            if not time_ok(): break
            url='https://api.openalex.org/works?'+urllib.parse.urlencode({'search':q,'per-page':str(seed['per_page']),'page':str(page),'sort':'cited_by_count:desc','mailto':'research@system-master.local'})
            try:
                r=fetch(url); requests+=1; data=json.loads(r['body'].decode('utf-8','ignore'))
                for w in data.get('results',[]):
                    k=key_for(w.get('doi'),w.get('id'),w.get('display_name'))
                    if not k: continue
                    append(qhits,{'provider':'OPENALEX','key':k,'query':q,'page':page})
                    if k in seen_oa: continue
                    seen_oa.add(k); loc=w.get('primary_location') or {}; src=(loc.get('source') or {}); oa=w.get('open_access') or {}; topics=w.get('topics') or []
                    append(out/'openalex_works.jsonl',{'query_first_seen':q,'openalex_id':w.get('id'),'doi':w.get('doi'),'title':w.get('display_name'),'publication_year':w.get('publication_year'),'type':w.get('type'),'cited_by_count':w.get('cited_by_count'),'referenced_works_count':len(w.get('referenced_works') or []),'open_access':{'is_oa':oa.get('is_oa'),'oa_status':oa.get('oa_status'),'oa_url':oa.get('oa_url')},'primary_source':{'id':src.get('id'),'name':src.get('display_name'),'type':src.get('type')},'topics':[{'id':t.get('id'),'name':t.get('display_name'),'score':t.get('score')} for t in topics[:5]],'authors':[(a.get('author') or {}).get('display_name') for a in (w.get('authorships') or [])[:12]]}); oa_count+=1
            except Exception as exc: failures+=1; append(log,{'provider':'OPENALEX','query':q,'page':page,'url':url,'error':repr(exc),'at':datetime.now(timezone.utc).isoformat()})
            pause()
        for offset in [i*int(seed['per_page']) for i in range(int(seed['pages_per_query']))]:
            if not time_ok(): break
            params={'query.bibliographic':q,'rows':str(seed['per_page']),'offset':str(offset),'select':'DOI,title,author,published,type,URL,license,is-referenced-by-count,subject','mailto':'research@system-master.local'}
            url='https://api.crossref.org/works?'+urllib.parse.urlencode(params)
            try:
                r=fetch(url); requests+=1; data=json.loads(r['body'].decode('utf-8','ignore'))
                for w in (data.get('message') or {}).get('items',[]):
                    title=(w.get('title') or [''])[0]; k=key_for(w.get('DOI'),None,title)
                    if not k: continue
                    append(qhits,{'provider':'CROSSREF','key':k,'query':q,'offset':offset})
                    if k in seen_cr: continue
                    seen_cr.add(k); append(out/'crossref_works.jsonl',{'query_first_seen':q,'doi':w.get('DOI'),'title':title,'type':w.get('type'),'url':w.get('URL'),'reference_count':w.get('is-referenced-by-count'),'authors':[{'given':a.get('given'),'family':a.get('family')} for a in (w.get('author') or [])[:12]],'license':w.get('license') or [],'published':w.get('published'),'subjects':w.get('subject') or []}); cr_count+=1
            except Exception as exc: failures+=1; append(log,{'provider':'CROSSREF','query':q,'offset':offset,'url':url,'error':repr(exc),'at':datetime.now(timezone.utc).isoformat()})
            pause()
    elapsed=round(time.monotonic()-start,3)
    summary={**plan,'standing':'PASS','stop_reason':stop,'elapsed_seconds':elapsed,'requests_attempted':requests,'request_failures':failures,'curated_sources_recorded':curated_count,'openalex_unique_works':oa_count,'crossref_unique_works':cr_count,'full_text_book_acquisition_performed':False,'raw_article_or_book_bodies_persisted':False,'rights_status':'CANDIDATE_DISCOVERY_ONLY__STEP_D_MUST_ADJUDICATE','named_author_imitation_target':False,'completed_at_utc':datetime.now(timezone.utc).isoformat(),'completed_at_new_york':now_ny().isoformat()}
    (out/'harvest_summary.json').write_text(json.dumps(summary,indent=2)+'\n',encoding='utf-8'); print('LITERARY_DEEP_HARVEST=PASS '+json.dumps(summary,separators=(',',':')))

if __name__=='__main__': main()
