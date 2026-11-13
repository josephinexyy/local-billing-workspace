"""Build versioned, self-contained downloads using only Python's standard library."""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
import argparse
import hashlib
import json
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def build(output):
    version = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version']
    if not re.fullmatch(r'\d+\.\d+\.\d+', version):
        raise ValueError('Expected a numeric major.minor.patch version')
    commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    subprocess.run([sys.executable, str(ROOT / 'scripts/build-offline.py')], check=True)
    # Package only the committed runtime, never a private or modified local copy.
    subprocess.run(['git', 'diff', '--exit-code', '--quiet', 'HEAD', '--', 'dist'], cwd=ROOT, check=True)
    standalone = (ROOT / 'dist/Billing-Workspace.html').read_bytes()
    if b'<script src=' in standalone:
        raise ValueError('The offline application still has external script references')
    licenses = {name: (ROOT / name).read_text(encoding='utf-8') for name in ['LICENSE', 'THIRD_PARTY_NOTICES.md']}
    for folder in ['dist/vendor', 'dist/pdf-assets']:
        for file in sorted((ROOT / folder).glob('*LICENSE*')):
            licenses[str(file.relative_to(ROOT))] = file.read_text(encoding='utf-8')
    manifest = {'version': version, 'source_commit': commit, 'runtime_sha256': sha256(standalone)}
    # Carry the exact license texts with the standalone HTML too; this JSON is not executed.
    metadata = json.dumps({**manifest, 'licenses': licenses}, ensure_ascii=True).replace('</', '<\\/')
    marker = ('\n<script type="application/json" id="billing-release-info">' + metadata + '</script>\n').encode()
    closing = standalone.rfind(b'</html>')
    if closing < 0:
        raise ValueError('Missing closing HTML element')
    html = standalone[:closing] + marker + standalone[closing:]
    stem = f'Local-Billing-Workspace-v{version}'
    html_name = f'Billing-Workspace-v{version}.html'
    instructions = f'''本地开票工作台 v{version}

1. 用 Chrome 打开 {html_name}。
2. 点击右上角“体验演示”，先用虚构数据试一次开单和收款。
3. 正式使用时点击“退出演示”，再填写自己的资料。

不需要安装 Python、Node.js、注册账号或配置数据库。
演示账本与正式账本分别保存，重置演示不会清空正式账本。

已有账本：更新前先导出完整备份，再关闭旧页面；新版中按需导入。
请保持正式使用的文件位置和名称稳定。不同文件、浏览器、网址和设备之间不会自动同步。
请勿把真实客户资料或完整备份上传到 GitHub。
OCR、翻译和下载功能受浏览器支持影响；首次使用请先用虚构资料核对。

项目：https://github.com/josephinexyy/local-billing-workspace
版本说明：https://github.com/josephinexyy/local-billing-workspace/releases/tag/v{version}

English quick start
Open {html_name} in Chrome, then select Try demo.
No Python, Node.js, account or database setup is needed.
Export a full backup before upgrading. Records stay in the current browser and do not sync automatically.
'''
    files = {html_name: html, '使用说明.txt': instructions.encode('utf-8-sig'), 'VERSION.json': (json.dumps(manifest, indent=2) + '\n').encode()}
    for name, text in licenses.items():
        # Keep original third-party license filenames; the public runtime contains no private records.
        files['licenses/' + Path(name).name] = text.encode('utf-8')
    output.mkdir(parents=True, exist_ok=True)
    (output / html_name).write_bytes(html)
    zip_path = output / (stem + '.zip')
    with ZipFile(zip_path, 'w', compression=ZIP_DEFLATED, compresslevel=9) as archive:
        for name, data in sorted(files.items()):
            info = ZipInfo(stem + '/' + name, date_time=(2026, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.compress_type = ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, data, compress_type=ZIP_DEFLATED, compresslevel=9)
    with ZipFile(zip_path) as archive:
        if archive.testzip() is not None:
            raise ValueError('ZIP integrity verification failed')
        if archive.read(stem + '/' + html_name) != html:
            raise ValueError('The ZIP does not contain the exact standalone download')
    checksums = {html_name: sha256(html), zip_path.name: sha256(zip_path.read_bytes())}
    (output / 'SHA256SUMS.txt').write_text(''.join(f'{digest}  {name}\n' for name, digest in sorted(checksums.items())), encoding='utf-8')
    result = {'version': version, 'source_commit': commit, 'output': str(output), 'files': [{'name': name, 'bytes': (output / name).stat().st_size, 'sha256': digest} for name, digest in checksums.items()]}
    print(json.dumps(result, indent=2))
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', type=Path, default=ROOT / 'release-assets')
    build(parser.parse_args().output_dir.resolve())
