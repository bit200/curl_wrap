function StatusLogger() {
    const [appState, setAppState] = useState('IDLE');
    const [statusText, setStatusText] = useState('Ожидание действий...');

    const handleLogStatus = (action) => {
        if (window.electronAPI && window.electronAPI.sendStatus) {
            window.electronAPI.sendStatus(action);
        } else {
            console.log(`Fallback mock send: ${action}`);
        }

        setAppState(action === 'СТАРТ' ? 'STARTED' : 'STOPPED');
        setStatusText(`Последнее действие: ${action}`);
    };

    const children = [];

    // 1. Conditional logic for buttons using native React elements
    if (appState === 'IDLE' || appState === 'STOPPED') {
        children.push(
            e('button', {
                key: 'start-btn',
                className: 'btn-start',
                onClick: () => handleLogStatus('СТАРТ')
            }, 'СТАРТ')
        );
    }

    if (appState === 'STARTED') {
        children.push(
            e('button', {
                key: 'stop-btn',
                className: 'btn-stop',
                onClick: () => handleLogStatus('СТОП')
            }, 'СТОП')
        );
    }

    // 2. Add the status text container
    children.push(
        e('div', { key: 'status-txt', id: 'status-text' }, statusText)
    );

    // Return wrapped inside a main wrapper container div
    return e('div', { style: { textAlign: 'center' } }, children);
}