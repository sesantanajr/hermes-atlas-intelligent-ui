"""Install a built wheel outside the checkout and smoke-test its complete payload."""
import json
import subprocess
import sys
import tempfile
import tomllib
import venv
from pathlib import Path

version = tomllib.loads((Path(__file__).resolve().parents[1] / 'pyproject.toml').read_text(encoding='utf-8'))['project']['version']
wheel = Path(sys.argv[1]).resolve()
if wheel.is_dir():
    wheel = wheel / f'hermes_atlas_intelligent_ui-{version}-py3-none-any.whl'
assert wheel.name == f'hermes_atlas_intelligent_ui-{version}-py3-none-any.whl' and wheel.is_file(), wheel
with tempfile.TemporaryDirectory(prefix='atlas-wheel-') as directory:
    root = Path(directory)
    venv.create(root/'env', with_pip=True)
    python = root/'env'/('Scripts/python.exe' if sys.platform == 'win32' else 'bin/python')
    subprocess.run([str(python), '-m', 'pip', 'install', str(wheel)], check=True, cwd=root)
    subprocess.run([str(python), '-I', '-m', 'atlas.cli', 'install-plugin', '--home', str(root/'home')], check=True, cwd=root)
    plugin = root/'home/plugins/hermes-atlas'
    for name in ['plugin.yaml', '__init__.py', 'atlas/api.py', 'atlas/preview.py', 'atlas/workspace_identity.py',
                 'atlas/block_base.py', 'atlas/explore.py', 'atlas/series.py', 'atlas/spatial.py', 'atlas/study.py',
                 'desktop/plugin.js', 'dashboard/plugin_api.py', 'dashboard/dist/index.js']:
        assert (plugin/name).is_file(), name
    code = r'''
from pathlib import Path
import atlas
from fastapi.testclient import TestClient
from atlas.server import app
assert Path(atlas.__file__).is_relative_to(Path.cwd()/'env'), atlas.__file__
with TestClient(app, base_url='http://127.0.0.1') as client:
    response = client.get('/')
    assert response.status_code == 200 and '<html' in response.text
    import re
    asset = re.search(r'src="([^"]+\.js)"', response.text)[1]
    assert client.get(asset).status_code == 200
    from atlas.server import dist
    for pattern in ['cinema-*.webp', 'camera-*.webp']:
        asset, = (dist / 'assets').glob(pattern)
        image = client.get('/assets/' + asset.name)
        assert image.status_code == 200 and image.content[:4] == b'RIFF'
'''
    subprocess.run([str(python), '-I', '-c', code], check=True, cwd=root)
    print(json.dumps({'wheel': wheel.name, 'isolated_install': True, 'ui_assets': True, 'plugin_payload': True}))
