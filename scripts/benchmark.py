"""Repeatable local microbenchmark; no model calls, credentials or user data."""
import argparse
import json
import platform
import statistics
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from atlas.models import Canvas
from atlas.protocol import INSTRUCTIONS
from atlas.store import Store

parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]

with tempfile.TemporaryDirectory(prefix='atlas-benchmark-') as directory:
    store = Store(Path(directory)/'test.db')
    canvas = Canvas.model_validate({'id': 'benchmark', 'title': 'Synthetic benchmark', 'blocks': [{'type': 'text', 'id': 'text', 'title': 'Text', 'text': 'Synthetic text'}]})
    def write(_):
        start = time.perf_counter()
        record = store.save(canvas)
        return record['revision'], (time.perf_counter()-start)*1000
    start = time.perf_counter()
    with ThreadPoolExecutor(max_workers=4) as pool:
        samples = list(pool.map(write, range(100)))
    wall = time.perf_counter()-start
    assert len(set(revision for revision, _ in samples)) == 100
    values = sorted(value for _, value in samples)
    reads = []
    for _ in range(100):
        start = time.perf_counter()
        assert store.get('benchmark')['revision'] == 100
        reads.append((time.perf_counter()-start)*1000)
    result = {
        'environment': {'python': platform.python_version(), 'os': platform.system(), 'scope': 'local synthetic microbenchmark, not a provider comparison'},
        'sqlite': {'writes': 100, 'workers': 4, 'unique_revisions': 100, 'seconds': round(wall, 4), 'write_median_ms': round(statistics.median(values), 3), 'write_p95_ms': round(values[94], 3), 'read_median_ms': round(statistics.median(reads), 3)},
        'protocol': {'instruction_bytes': len(INSTRUCTIONS.encode()), 'full_schema_bytes': len(json.dumps(Canvas.model_json_schema(), ensure_ascii=False).encode()), 'history_resent': False},
        'bundles': {str(path.relative_to(root)): path.stat().st_size for pattern in ['dist/assets/*.js', 'dashboard/dist/*.js', 'desktop/*.js'] for path in root.glob(pattern)},
    }
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps(result, indent=2))
