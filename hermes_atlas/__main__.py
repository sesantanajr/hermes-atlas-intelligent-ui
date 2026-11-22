"""``python -m hermes_atlas``: the same commands as ``hermes atlas`` for a standalone installation."""
import sys

from .agent.cli import main

if __name__ == "__main__":
    sys.exit(main())
