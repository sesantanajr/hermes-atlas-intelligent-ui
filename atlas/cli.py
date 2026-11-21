"""Wheel entry point, including the complete prebuilt plugin payload."""
import argparse
import os
import shutil
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(prog='hermes-atlas')
    parser.add_argument('command', nargs='?', choices=['serve','install-plugin'], default='serve')
    parser.add_argument('--home', type=Path, help='Hermes home for plugin installation')
    args = parser.parse_args()
    if args.command == 'serve':
        from .server import main as serve
        serve()
        return
    source = Path(__file__).parent / 'plugin'
    if not (source / 'plugin.yaml').is_file():
        parser.error('Plugin assets missing. Build the release with npm run build before packaging.')
    home = args.home or Path(os.environ.get('HERMES_HOME', str(Path.home()/'.hermes')))
    target = home / 'plugins' / 'hermes-atlas'
    if target.exists():
        parser.error(f'{target} already exists. Use hermes plugins update for an existing installation.')
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(source, target)
    print(f'Installed plugin files at {target}. Run: hermes plugins doctor {target} --ci; hermes plugins enable hermes-atlas')


if __name__ == '__main__':
    main()
