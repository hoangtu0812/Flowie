from flowie_backup.cli import main

if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Tool diagnostics and configuration can include production secrets.
        print(
            f"Backup operation failed ({type(error).__name__}); inspect the protected status file and service state."
        )
        raise SystemExit(1) from None
