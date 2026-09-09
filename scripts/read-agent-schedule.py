"""Read a monthly schedule and corporate email directory without changing the workbook.
Usage: python scripts/read-agent-schedule.py WORKBOOK --sheet "September 26" --output FILE
Output contains corporate emails and must be kept outside the public frontend/repository.
"""
import argparse, calendar, collections, json, re, zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
REL = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'

def name_key(value):
    return tuple(re.sub(r'\([^)]*\)', '', value).casefold().replace('ё','е').split()[:2])

def read_schedule(path, sheet_name):
    with zipfile.ZipFile(path) as archive:
        shared = [''.join(node.itertext()) for node in ET.fromstring(archive.read('xl/sharedStrings.xml')).findall('m:si', NS)]
        rels = {r.get('Id'):r.get('Target') for r in ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))}
        sheets = {s.get('name').strip(): rels[s.get(REL)] for s in ET.fromstring(archive.read('xl/workbook.xml')).findall('m:sheets/m:sheet',NS)}
        def rows(name):
            target = sheets[name].lstrip('/')
            if not target.startswith('xl/'): target = 'xl/' + target
            result = []
            for row in ET.fromstring(archive.read(target)).findall('m:sheetData/m:row',NS):
                values = {}
                for cell in row:
                    v = cell.find('m:v',NS)
                    text = v.text if v is not None else ''
                    if cell.get('t') == 's' and text: text = shared[int(text)]
                    if text: values[re.sub(r'\d','',cell.get('r'))] = text.strip()
                result.append((int(row.get('r')),values))
            return result
        emails = collections.defaultdict(set)
        for _,row in rows('Почты сотр'):
            email = row.get('E','').strip().lower()
            if re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',email) and row.get('B'):
                emails[name_key(row['B'])].add(email)
        month_word, year_word = sheet_name.strip().split()
        month = list(calendar.month_name).index(month_word)
        year = 2000 + int(year_word) if len(year_word) == 2 else int(year_word)
        source_rows = rows(sheet_name)
        date_columns = {col:int(float(value)) for col,value in source_rows[0][1].items() if re.fullmatch(r'\d+(\.0)?',value) and 1 <= float(value) <= calendar.monthrange(year,month)[1]}
        codes = {'7': ['day'], '6.5': ['evening'], '9': ['night'], '13': ['day','evening']}
        records, issues, people = [], [], []
        for row_number,row in source_rows:
            name = row.get('C','')
            if not re.search(r'\((?:sup|shift)\)',name,re.I): continue
            matches = emails[name_key(name)]
            if len(matches) != 1:
                issues.append({'row':row_number,'name':name,'reason':'No unique corporate email','candidates':sorted(matches)})
                continue
            email = next(iter(matches)); people.append({'name':name,'email':email})
            for col,day in date_columns.items():
                raw = row.get(col,'')
                try: code = format(float(raw),'g')
                except ValueError: code = raw
                if code in ('0',''): continue
                if code not in codes:
                    issues.append({'cell':f'{col}{row_number}','name':name,'reason':'Unknown shift code','value':raw}); continue
                for shift in codes[code]:
                    records.append({'day':f'{year:04d}-{month:02d}-{day:02d}','email':email,'shift':shift})
        unique = {(r['day'],r['email'],r['shift']):r for r in records}
        return {'sheet':sheet_name,'month':f'{year:04d}-{month:02d}','people':people,'records':list(unique.values()),'issues':issues}

if __name__ == '__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('workbook');parser.add_argument('--sheet',required=True);parser.add_argument('--output',required=True)
    args=parser.parse_args(); data=read_schedule(args.workbook,args.sheet)
    Path(args.output).write_text(json.dumps(data,ensure_ascii=False),encoding='utf-8')
    print(json.dumps({'month':data['month'],'matched_people':len(data['people']),'assignments':len(data['records']),'issues':data['issues']},ensure_ascii=False))
