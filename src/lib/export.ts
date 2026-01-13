import { EnhancedSimulation } from '@/types/simulation';

/**
 * Generate HTML report for simulations matching iprospect.py format exactly.
 * This format is optimized for Google Docs import compatibility.
 */
export function generateSimulationHTML(simulations: EnhancedSimulation[]): string {
    const lines: string[] = [];

    // HTML header - minimal styling like iprospect.py
    lines.push('<!DOCTYPE html>');
    lines.push('<html>');
    lines.push('<head>');
    lines.push('    <meta charset="UTF-8">');
    lines.push('    <title>Virtual Assistant Conversation Samples</title>');
    lines.push('    <style>');
    lines.push('        h1 { font-size: 25px; }');
    lines.push('        h2 { font-size: 21px; }');
    lines.push('    </style>');
    lines.push('</head>');
    lines.push('<body>');

    // Group simulations by flow type
    const groupedByFlow: Record<string, EnhancedSimulation[]> = {
        'NEW_SALES_LEAD': [],
        'EXISTING_CUSTOMER': [],
        'UNDETERMINED': [],
    };

    simulations.forEach(sim => {
        const flowType = sim.metadata.intent.flowType;
        if (groupedByFlow[flowType]) {
            groupedByFlow[flowType].push(sim);
        } else {
            groupedByFlow['UNDETERMINED'].push(sim);
        }
    });

    const flowTitles: Record<string, string> = {
        'NEW_SALES_LEAD': 'NEW SALES LEAD CONVERSATIONS',
        'EXISTING_CUSTOMER': 'EXISTING CUSTOMER SUPPORT',
        'UNDETERMINED': 'UNDETERMINED CUSTOMER TYPE',
    };

    // Render each flow section
    let firstSection = true;
    Object.entries(groupedByFlow).forEach(([flowType, flowSimulations]) => {
        if (flowSimulations.length === 0) return;

        if (!firstSection) {
            lines.push('<br><br>');
        }
        firstSection = false;

        lines.push(`<h1 style="font-size:25px">${flowTitles[flowType]}</h1>`);
        lines.push('<hr>');

        flowSimulations.forEach(sim => {
            lines.push(formatConversationReport(sim));
        });
    });

    // HTML footer
    lines.push('</body>');
    lines.push('</html>');

    return lines.join('\n');
}

function formatConversationReport(simulation: EnhancedSimulation): string {
    const lines: string[] = [];
    const { metadata, turns } = simulation;

    // Conversation header
    lines.push(`<h2 style="font-size:21px">Conversation ${simulation.simulationNumber}</h2>`);

    // Metadata block - single <p> with <br> line breaks like iprospect.py
    lines.push(`<p>Name: ${metadata.name}<br>`);
    lines.push(`Persona: ${metadata.persona.role}<br>`);
    lines.push(`Intent: ${metadata.intent.name}<br>`);
    lines.push(`Goal: ${metadata.persona.goal}<br>`);
    lines.push(`Emotion: ${metadata.emotion.name}<br>`);
    lines.push(`Outcome: ${metadata.outcome || 'N/A'}</p>`);
    lines.push('<br>');

    // Chat dialogue - simple <p><b>Role:</b> message</p> format like iprospect.py
    turns.forEach(turn => {
        const isCustomer = turn.role === 'user';
        const label = isCustomer ? 'Customer' : 'Agent';

        // Convert newlines to <br> tags to preserve formatting
        const messageHtml = turn.content.replace(/\n/g, '<br>');

        lines.push(`<p><b>${label}:</b> ${messageHtml}</p>`);
        lines.push('<br>');
    });

    lines.push('<hr>');

    return lines.join('\n');
}

/**
 * Trigger a file download in the browser.
 */
export function downloadHTML(html: string, filename: string): void {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Generate a timestamped filename for the export.
 */
export function generateExportFilename(batchName?: string): string {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const prefix = batchName ? batchName.toLowerCase().replace(/\s+/g, '_') : 'simulation_report';
    return `${prefix}_${timestamp}.html`;
}
