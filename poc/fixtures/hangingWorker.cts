process.on('SIGTERM', () => {
	// Deliberately ignore graceful termination to exercise the SIGKILL fallback.
});

setInterval(() => undefined, 1_000);
