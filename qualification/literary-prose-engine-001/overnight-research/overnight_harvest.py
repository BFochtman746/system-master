#!/usr/bin/env python3
import argparse, json, re, time, urllib.parse, urllib.request, hashlib, xml.etree.ElementTree as ET
from pathlib import Path
from datetime import datetime, timezone, timedelta, date

UA='SystemMaster-LiteraryResearch/1.0 (+private research qualification; metadata only)'
ALLOWED_HOSTS={'www.open.edu','open.edu','editors.ca','www.editors.ca','www.gutenberg.org','gutenberg.org','standardebooks.org','www.standardebooks.org','api.openalex.org','api.crossref.org'}

def assert_allowed_url(url):
    u=urllib.parse.urlparse(url)
    if u.scheme != 'https' or not u.hostname or u.hostname.lower() not in ALLOWED_HOSTS:
        raise ValueError(f'url_not_allowed:{u.scheme}://{u.hostname}')

class SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        assert_allowed_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)

OPENER=urllib.request.build_opener(SafeRedirect())

def eastern_offset_hours(d):
    # US Eastern DST: second Sunday in March through first Sunday in November.
    def nth_sunday(year, month, n):
        first=date(year,month,1); delta=(6-first.weekday())%7
        return date(year,month,1+delta+7*(n-1))
    start=nth_sunday(d.year,3,2); end=nth_sunday(d.year,11,1)
    return -4 if start <= d < end else -5

def now_ny():
    u=datetime.now(timezone.utc); off=eastern_offset_hours(u.date()); return u+timedelta(hours=off)

def should_stop(active_date, stop_hour):
    n=now_ny()
    return n.date().isoformat()!=active_date or n.hour>=stop_hour

def fetch(url, max_bytes=2_000_000, timeout=30):
    assert_allowed_url(url)
    req=urllib.request.Request(url,headers={'User-Agent':UA,'Accept':'application/json, application/atom+xml, application/xml, text/html;q=0.8, */*;q=0.5'})
    with OPENER.open(req,timeout=timeout) as r:
        assert_allowed_url(r.geturl())
        data=r.read(max_bytes+1)
        if len(data)>max_bytes: data=data[:max_bytes]
        return {'status':getattr(r,'status',200),'content_type':r.headers.get('Content-Type',''),'body':data,'final_url':r.geturl()}

def append_jsonl(path,obj):
    with path.open('a',encoding='utf-8') as f: f.write(json.dumps(obj,ensure_ascii=False)+'\n')

def clean_html_text(b):
    s=b.decode('utf-8','ignore'); s=re.sub(r'<script.*?</script>|<style.*?</style>',' ',s,flags=re.I|re.S); s=re.sub(r'<[^>]+>',' ',s); return re.sub(r'\s+',' ',s).strip()

def title_from_html(b):
    s=b.decode('utf-8','ignore'); m=re.search(r'<title[^>]*>(.*?)</title>',s,re.I|re.S); return re.sub(r'\s+',' ',m.group(1)).strip() if m else None

def license_signal(text):
    pats=['creative commons','cc by','cc0','public domain','copyright','license','licence','terms of use']
    low=text.lower(); hits=[]
    for p in pats:
        i=low.find(p)
        if i>=0: hits.append(text[max(0,i-180):min(len(text),i+420)])
    return hits[:4]

def norm_title(s): return re.sub(r'[^a-z0-9]+',' ',(s or '').lower()).strip()

def harvest_curated(seeds,out,log,active_date,stop_hour):
    for src in seeds['curated_sources']:
        if should_stop(active_date,stop_hour): break
        rec={'kind':'CURATED_SOURCE','category':src['category'],'seed_title':src['title'],'url':src['url'],'expected_use':src['expected_use'],'fetched_at':datetime.now(timezone.utc).isoformat()}
        try:
            r=fetch(src['url']); rec.update({'http_status':r['status'],'final_url':r['final_url'],'content_type':r['content_type'],'payload_sha256':hashlib.sha256(r['body']).hexdigest()})
            if 'html' in r['content_type'].lower():
                t=clean_html_text(r['body']); rec['page_title']=title_from_html(r['body']); rec['rights_license_signals']=license_signal(t)
            elif 'xml' in r['content_type'].lower() or 'atom' in r['content_type'].lower() or 'opds' in src['url'].lower():
                try:
                    root=ET.fromstring(r['body']); entries=[]
                    for e in list(root.iter()):
                        if e.tag.endswith('entry'):
                            title=next((x.text for x in e if x.tag.endswith('title') and x.text),None)
                            eid=next((x.text for x in e if x.tag.endswith('id') and x.text),None)
                            if title: entries.append({'title':title,'id':eid})
                            if len(entries)>=500: break
                    rec['opds_entries']=entries
                except Exception as exc: rec['xml_parse_error']=str(exc)
            append_jsonl(out/'curated_sources.jsonl',rec)
        except Exception as exc:
            rec['error']=repr(exc); append_jsonl(out/'curated_sources.jsonl',rec)
        append_jsonl(log,{'url':src['url'],'at':datetime.now(timezone.utc).isoformat(),'ok':'error' not in rec}); time.sleep(1.0)

def harvest_openalex(queries,out,log,active_date,stop_hour):
    seen=set()
    for q in queries:
        for page in (1,2):
            if should_stop(active_date,stop_hour): return
            url='https://api.openalex.org/works?'+urllib.parse.urlencode({'search':q,'per-page':'100','page':str(page),'sort':'cited_by_count:desc'})
            try:
                r=fetch(url); data=json.loads(r['body'].decode('utf-8','ignore'))
                for w in data.get('results',[]):
                    key=w.get('doi') or w.get('id') or norm_title(w.get('display_name'))
                    if not key or key in seen: continue
                    seen.add(key)
                    loc=w.get('primary_location') or {}; src=loc.get('source') or {}; oa=w.get('open_access') or {}
                    append_jsonl(out/'openalex_works.jsonl',{'query':q,'openalex_id':w.get('id'),'doi':w.get('doi'),'title':w.get('display_name'),'publication_year':w.get('publication_year'),'type':w.get('type'),'cited_by_count':w.get('cited_by_count'),'open_access':{'is_oa':oa.get('is_oa'),'oa_status':oa.get('oa_status'),'oa_url':oa.get('oa_url')},'primary_source':{'id':src.get('id'),'name':src.get('display_name'),'type':src.get('type')},'authorships':[{'author':(a.get('author') or {}).get('display_name')} for a in (w.get('authorships') or [])[:12]]})
            except Exception as exc: append_jsonl(log,{'url':url,'query':q,'error':repr(exc),'at':datetime.now(timezone.utc).isoformat()})
            time.sleep(1.0)

def harvest_crossref(queries,out,log,active_date,stop_hour):
    seen=set()
    for q in queries:
        for offset in (0,100):
            if should_stop(active_date,stop_hour): return
            params={'query.bibliographic':q,'rows':'100','offset':str(offset),'select':'DOI,title,author,published,type,URL,license,is-referenced-by-count'}
            url='https://api.crossref.org/works?'+urllib.parse.urlencode(params)
            try:
                r=fetch(url); data=json.loads(r['body'].decode('utf-8','ignore'))
                for w in (data.get('message') or {}).get('items',[]):
                    title=(w.get('title') or [''])[0]; key=w.get('DOI') or norm_title(title)
                    if not key or key in seen: continue
                    seen.add(key)
                    append_jsonl(out/'crossref_works.jsonl',{'query':q,'doi':w.get('DOI'),'title':title,'type':w.get('type'),'url':w.get('URL'),'reference_count':w.get('is-referenced-by-count'),'authors':[{'given':a.get('given'),'family':a.get('family')} for a in (w.get('author') or [])[:12]],'license':w.get('license') or [],'published':w.get('published')})
            except Exception as exc: append_jsonl(log,{'url':url,'query':q,'error':repr(exc),'at':datetime.now(timezone.utc).isoformat()})
            time.sleep(1.0)

def summarize(out,seeds,active_date):
    counts={}
    for p in out.glob('*.jsonl'):
        counts[p.name]=sum(1 for _ in p.open(encoding='utf-8'))
    summary={'qualification_id':'LITERARY-OVERNIGHT-RESEARCH-HARVEST-001','active_date_new_york':active_date,'completed_at_utc':datetime.now(timezone.utc).isoformat(),'completed_at_new_york':now_ny().isoformat(),'counts':counts,'queries':len(seeds['research_queries']),'curated_sources':len(seeds['curated_sources']),'full_text_book_acquisition_performed':False,'raw_article_or_book_bodies_persisted':False,'rights_status':'CANDIDATE_DISCOVERY_ONLY__STEP_D_MUST_ADJUDICATE','named_author_imitation_target':False}
    (out/'harvest_summary.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')

if __name__=='__main__':
    ap=argparse.ArgumentParser(); ap.add_argument('--seeds',required=True); ap.add_argument('--output',required=True); ap.add_argument('--active-date',required=True); ap.add_argument('--stop-hour',type=int,default=7); args=ap.parse_args()
    out=Path(args.output); out.mkdir(parents=True,exist_ok=True); log=out/'request_log.jsonl'; seeds=json.loads(Path(args.seeds).read_text(encoding='utf-8'))
    n=now_ny()
    if n.date().isoformat()!=args.active_date or n.hour>=args.stop_hour:
        (out/'harvest_summary.json').write_text(json.dumps({'qualification_id':'LITERARY-OVERNIGHT-RESEARCH-HARVEST-001','standing':'NO_OP_OUTSIDE_AUTHORIZED_WINDOW','observed_new_york_time':n.isoformat(),'active_date':args.active_date,'full_text_book_acquisition_performed':False},indent=2)); raise SystemExit(0)
    harvest_curated(seeds,out,log,args.active_date,args.stop_hour)
    harvest_openalex(seeds['research_queries'],out,log,args.active_date,args.stop_hour)
    harvest_crossref(seeds['research_queries'],out,log,args.active_date,args.stop_hour)
    summarize(out,seeds,args.active_date)
