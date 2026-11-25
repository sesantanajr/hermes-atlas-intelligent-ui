"""1.1.2 doctor checks: what this Hermes offers for canvases, and where the atlas toolset is missing."""
from hermes_atlas import doctor


def test_reach_says_what_an_older_hermes_lacks():
    status, name, detail = doctor.check_reach()  # no Hermes in the test environment
    assert (status, name) == (doctor.WARN, "hermes reach")
    assert "plugin RPC" in detail and "turn client" in detail


def test_toolset_lists_platforms_without_atlas(monkeypatch):
    monkeypatch.setattr(doctor, "_config_view", lambda: {"platform_toolsets": {
        "cli": ["web", "atlas"], "whatsapp": ["web"], "telegram": ["atlas"], "cron": ["web"]}})
    status, name, detail = doctor.check_toolset()
    assert status == doctor.WARN and "platform_toolsets.cron, platform_toolsets.whatsapp" in detail
    monkeypatch.setattr(doctor, "_config_view", lambda: {"platform_toolsets": {"cli": ["atlas"]}})
    assert doctor.check_toolset()[0] == doctor.OK
    monkeypatch.setattr(doctor, "_config_view", lambda: {"agent": {"disabled_toolsets": ["atlas"]}})
    assert "disabled_toolsets" in doctor.check_toolset()[2]
    monkeypatch.setattr(doctor, "_config_view", lambda: {})
    assert doctor.check_toolset() == (doctor.OK, "toolset", "default toolsets")


def test_the_new_checks_run_with_the_others():
    names = [name for _, name, _ in doctor.run()]
    assert "hermes reach" in names and "toolset" in names
