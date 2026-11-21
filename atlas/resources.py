"""Constant-size observations of the machine running Hermes."""
from datetime import datetime, timezone
from pathlib import Path
import os
import shutil
import sys


def snapshot():
    result = {'observed_at': datetime.now(timezone.utc).isoformat(),
              'scope':'system visible to this Hermes process', 'unavailable':[]}
    try:
        root = Path(sys.executable).anchor if os.name == 'nt' else '/'
        usage = shutil.disk_usage(root)
        result['disk'] = {'mount':root,'total_bytes':usage.total,'used_bytes':usage.used,'free_bytes':usage.free}
    except OSError:
        result['unavailable'].append('disk')
    try:
        loads = os.getloadavg()
        result['load_average'] = dict(zip(('1m','5m','15m'), loads))
    except (OSError,AttributeError):
        result['unavailable'].append('load_average')
    result['logical_cpus'] = os.cpu_count()
    try:
        fields = {}
        with Path('/proc/meminfo').open(encoding='ascii') as stream:
            for line in stream:
                key, _, value = line.partition(':')
                if key in ('MemTotal','MemAvailable','SwapTotal','SwapFree'):
                    number, unit = value.split()
                    if unit == 'kB':
                        fields[key] = int(number) * 1024
        for group, total,free in (('memory','MemTotal','MemAvailable'),('swap','SwapTotal','SwapFree')):
            if total in fields and free in fields:
                result[group] = {'total_bytes':fields[total],'available_bytes':fields[free]}
            else:
                result['unavailable'].append(group)
    except (OSError, ValueError):
        result['unavailable'].extend(('memory','swap'))
    return result
