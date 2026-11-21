from pathlib import Path
import shutil
from setuptools import setup
from setuptools.command.build_py import build_py

def prepare_assets():
    """Git installs have prebuilt bundles: package them without requiring Node."""
    root = Path(__file__).parent.resolve()
    if not (root/'dist/index.html').is_file():
        raise RuntimeError('Prebuilt UI missing. Run npm ci && npm run build before packaging.')
    for name in ['static', 'plugin']:
        target = (root/'atlas'/name).resolve()
        if not target.is_relative_to(root/'atlas'):
            raise RuntimeError('Generated assets must remain inside atlas/.')
        if target.exists():
            shutil.rmtree(target)
    shutil.copytree(root/'dist', root/'atlas/static')
    plugin = root/'atlas/plugin'
    plugin.mkdir()
    for name in ['__init__.py', 'plugin.yaml']:
        shutil.copy2(root/name, plugin/name)
    for name in ['dashboard', 'desktop']:
        shutil.copytree(root/name, plugin/name, ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
    (plugin/'atlas').mkdir()
    shutil.copy2(root/'atlas/catalog.json', plugin/'atlas/catalog.json')
    for source in (root/'atlas').glob('*.py'):
        shutil.copy2(source, plugin/'atlas'/source.name)

class CompleteBuild(build_py):
    def run(self):
        root = Path(__file__).parent
        for file in ['atlas/static/index.html', 'atlas/plugin/plugin.yaml', 'atlas/plugin/desktop/plugin.js', 'atlas/plugin/dashboard/dist/index.js']:
            if not (root/file).is_file():
                raise RuntimeError('UI assets missing. Run npm ci && npm run build before building a wheel.')
        generated = (Path(self.build_lib)/'atlas').resolve()
        if generated.exists():
            if not generated.is_relative_to((root/'build').resolve()):
                raise RuntimeError('Use a clean build directory under the project build/ directory.')
            shutil.rmtree(generated)
        super().run()

prepare_assets()
setup(cmdclass={'build_py': CompleteBuild})
