from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import sys, base64
dist = Path(__file__).resolve().parents[1] / 'dist'
html = (dist/'index.html').read_text(encoding='utf-8').replace('<html lang=', '<html data-offline lang=')
html = html.replace("vendor/invoice-hk.woff", "data:font/woff;base64,"+base64.b64encode((dist/"vendor/invoice-hk.woff").read_bytes()).decode())
def script(path):
    return '<script>' + path.read_text(encoding='utf-8').replace('</script','<\\/script') + '</script>'
assets = ''.join(script(f) for f in sorted((dist/'pdf-assets').glob('*.js')))
html = html.replace('<script src="lang.js"></script>',assets+script(dist/'lang.js'))
for name in ['demo-data.js','company.js','config.js','core.js','documents.js','backup.js','storage.js','customer-pdf.js','customer-tools.js','vendor/display-zh.js','vendor/canvas.js','vendor/pdf.js','vendor/zip.js','app.js']:
    html = html.replace('<script src="'+name+'"></script>',script(dist/name))
out = dist/'Billing-Workspace.html'
with out.open('w', encoding='utf-8', newline='\n') as handle:
    handle.write(html)
if len(sys.argv)>1:
    with ZipFile(sys.argv[1],'w',ZIP_DEFLATED) as z:
        z.write(out,out.name)
        for f in [*(dist/'pdf-assets').glob('*LICENSE*'),*(dist/'vendor').glob('*LICENSE*')]:z.write(f,'licenses/'+f.name)
