import io
import shutil
from types import SimpleNamespace
from hermes_atlas import resources


def test_capacity_uses_os_counters(monkeypatch):
    monkeypatch.setattr(shutil,'disk_usage',lambda root: SimpleNamespace(total=1000,used=700,free=250))
    monkeypatch.setattr(resources.Path,'open',lambda path,**kw: io.StringIO('MemTotal: 100 kB\nMemAvailable: 30 kB\nSwapTotal: 0 kB\nSwapFree: 0 kB\n'))
    result=resources.snapshot()
    assert result['disk']['free_bytes']==250
    assert result['memory']=={'total_bytes':102400,'available_bytes':30720}
    assert result['swap']=={'total_bytes':0,'available_bytes':0}
    assert result['observed_at'].endswith('+00:00')


def test_snapshot_preserves_available_sections_when_counter_missing(monkeypatch):
    def unavailable(*args,**kwargs):
        raise OSError('unavailable')
    monkeypatch.setattr(resources.Path,'open',unavailable)
    result=resources.snapshot()
    assert 'disk' in result and {'swap','memory'} <= set(result['unavailable'])
    assert 'memory' not in result
