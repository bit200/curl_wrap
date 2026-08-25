const { useState, useEffect, useRef } = React;
const e = React.createElement;

function StatusLogger() {
    const [appState, setAppState] = useState('IDLE');
    const [statusText, setStatusText] = useState('Ожидание действий...');
    // State to hold array of historical log strings
    const [history, setHistory] = useState([]);

    const wsRef = useRef(null);

    // 1. LOAD HISTORY AND INITIALIZE WEBSOCKET ON MOUNT
    useEffect(() => {
        // Fetch historical log file rows from Electron filesystem bridge
        if (window.electronAPI && window.electronAPI.getHistory) {
            window.electronAPI.getHistory().then((logLines) => {
                setHistory(logLines);

                // Optional: Resume the UI button states based on the last log entry
                if (logLines.length > 0) {
                    const lastLog = logLines[logLines.length - 1];
                    if (lastLog.includes('СТАРТ')) {
                        setAppState('STARTED');
                        setStatusText('Последнее действие: СТАРТ');
                    } else if (lastLog.includes('СТОП')) {
                        setAppState('STOPPED');
                        setStatusText('Последнее действие: СТОП');
                    }
                }
            });
        }

        // Initialize direct frontend WebSocket client pipe
        const socket = new WebSocket('ws://localhost:8080');
        socket.onopen = () => console.log('[React WS] Connected');
        socket.onmessage = (event) => console.log('[React WS] Data:', event.data);

        wsRef.current = socket;

        return () => {
            if (wsRef.current) wsRef.current.close();
        };
    }, []);

    const handleLogStatus = (action) => {
        const timestamp = new Date().toLocaleString();
        const currentLogLine = `[${timestamp}] Статус: ${action}`;

        // Send to local file writer through Electron backend
        if (window.electronAPI && window.electronAPI.sendStatus) {
            window.electronAPI.sendStatus(action);
        }

        // Send directly to network server via frontend context socket
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'status-change', status: action, time: timestamp }));
        }

        setAppState(action === 'СТАРТ' ? 'STARTED' : 'STOPPED');
        setStatusText(`Последнее действие: ${action}`);

        // Append the new local event directly to our UI history list stream
        setHistory(prev => [...prev, currentLogLine]);
    };

    const children = [];

    // Buttons Rendering
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

    // Status Text Element
    children.push(
        e('div', { key: 'status-txt', id: 'status-text' }, statusText)
    );

    // 2. RENDER THE LOG HISTORY CONTAINER
    if (history.length > 0) {
        // Map over data entries to output separate text blocks
        const historyItems = history.map((line, index) =>
            e('div', {
                key: `log-${index}`,
                style: { fontSize: '12px', color: '#555', margin: '4px 0', fontFamily: 'monospace' }
            }, line)
        );

        children.push(
            e('div', {
                key: 'history-box',
                style: {
                    marginTop: '30px',
                    height: '180px',
                    overflowY: 'auto',
                    borderTop: '1px solid #ccc',
                    paddingTop: '15px',
                    width: '320px',
                    textAlign: 'left'
                }
            }, [
                e('strong', { key: 'title', style: { display: 'block', marginBottom: '8px' } }, 'История действий:'),
                e('div', { key: 'list-items-wrapper' }, historyItems)
            ])
        );
    }

    return e('div', { style: { textAlign: 'center' } }, children);
}
