import subprocess


def run(arguments, *, cwd=None, stdout=subprocess.PIPE, env=None):
    result = subprocess.run(
        arguments,
        cwd=cwd,
        stdout=stdout,
        stderr=subprocess.PIPE,
        env=env,
        check=False,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    if result.returncode:
        # External tools can include credentials or database content in diagnostics.
        raise RuntimeError(f"{arguments[0]} failed with exit code {result.returncode}")
    return result.stdout
