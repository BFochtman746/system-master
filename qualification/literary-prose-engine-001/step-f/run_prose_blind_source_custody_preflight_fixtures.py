#!/usr/bin/env python3
import hashlib, json, subprocess, sys, tempfile, zipfile
from pathlib import Path

SCRIPT = Path(__file__).with_name('prose_blind_source_custody_preflight.py')
W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

def make_docx(path: Path, paragraphs):
    body = []
    for text in paragraphs:
        if text is None:
            body.append('<w:p/>')
        else:
            esc = text.replace('&','&amp;').replace('<','&lt;').replace('>','&gt;')
            body.append(f'<w:p><w:r><w:t>{esc}</w:t></w:r></w:p>')
    xml = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
           f'<w:document xmlns:w="{W_NS}"><w:body>' + ''.join(body) + '</w:body></w:document>')
    with zipfile.ZipFile(path, 'w') as z:
        z.writestr('word/document.xml', xml)

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def run(contract, source_dir, output):
    cp = subprocess.run([sys.executable, str(SCRIPT), '--contract', str(contract), '--source-dir', str(source_dir), '--output', str(output)], capture_output=True, text=True)
    data = json.loads(output.read_text(encoding='utf-8'))
    return cp.returncode, data

def main():
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        docx = root/'fixture.docx'
        make_docx(docx, ['zero', None, 'one', 'two', 'three'])
        nonempty = ['zero','one','two','three']
        passage = ' '.join(nonempty[1:3])
        contract = {
            'objective':'FIXTURE',
            'source_custody':[{'source_id':'S','filename':'fixture.docx','source_package_sha256':sha(docx)}],
            'passage_reconstruction_contract':{
                'paragraph_index_space':'NONEMPTY_DOCX_PARAGRAPHS',
                'text_extraction_rule':'CONCAT_DESCENDANT_W_T_PER_W_P__STRIP_OUTER_WHITESPACE__DROP_EMPTY',
                'index_base':0,
                'range_end':'INCLUSIVE',
                'join_rule':'JOIN_SELECTED_NONEMPTY_PARAGRAPHS_WITH_SINGLE_ASCII_SPACE',
                'digest_rule':'SHA256_UTF8_OF_JOINED_PASSAGE'
            },
            'cases':[{'case_id':'C1','source_id':'S','source_paragraph_start':1,'source_paragraph_end':2,'passage_sha256':hashlib.sha256(passage.encode()).hexdigest(),'word_count':2}]
        }
        cpath=root/'contract.json'; out=root/'out.json'
        cpath.write_text(json.dumps(contract),encoding='utf-8')
        code,data=run(cpath,root,out)
        assert code==0 and data['passage_digest_matches']==1 and data['source_digest_matches']==1

        bad_index=json.loads(json.dumps(contract)); bad_index['passage_reconstruction_contract']['index_base']=1
        cpath.write_text(json.dumps(bad_index),encoding='utf-8')
        code,data=run(cpath,root,out)
        assert code==2 and 'CONTRACT_INDEX_SEMANTICS_NOT_0_BASED_INCLUSIVE' in data['errors']

        bad_source=json.loads(json.dumps(contract)); bad_source['source_custody'][0]['source_package_sha256']='0'*64
        cpath.write_text(json.dumps(bad_source),encoding='utf-8')
        code,data=run(cpath,root,out)
        assert code==2 and any(x.startswith('SOURCE_DIGEST_MISMATCH') for x in data['errors'])

        missing=json.loads(json.dumps(contract)); missing['source_custody'][0]['filename']='missing.docx'
        cpath.write_text(json.dumps(missing),encoding='utf-8')
        code,data=run(cpath,root,out)
        assert code==2 and any(x.startswith('SOURCE_MISSING') for x in data['errors'])

    print('PROSE BLIND SOURCE CUSTODY PREFLIGHT FIXTURES: PASS (4 cases)')

if __name__=='__main__':
    main()
