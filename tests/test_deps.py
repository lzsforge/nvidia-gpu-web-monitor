def test_psutil_installed():
    import psutil
    assert psutil.__version__
