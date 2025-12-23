const Canvas = require('canvas');
const GIFEncoder = require('gifencoder');
const funcs = require('./functions.js');

const COLORS = {
    background: '#0d1117',
    backgroundAlt: '#161b22',
    grid: '#21262d',
    text: '#f0f6fc',
    textDim: '#8b949e',
    textMuted: '#484f58',
    accent: '#58a6ff',
    accentGlow: '#388bfd',
    success: '#3fb950',
    warning: '#d29922',
    danger: '#f85149',
    gradientStart: '#58a6ff',
    gradientEnd: '#bc8cff',
    barGradientStart: '#238636',
    barGradientEnd: '#3fb950'
};

const FONTS = {
    title: 'bold 20px "Segoe UI", Arial, sans-serif',
    subtitle: '14px "Segoe UI", Arial, sans-serif',
    label: '13px Arial, sans-serif',
    value: 'bold 15px Arial, sans-serif',
    small: '11px Arial, sans-serif',
    tiny: '10px Arial, sans-serif'
};

async function renderLineChart(options) {
    const {
        data,
        labels,
        title = '',
        width = 700,
        height = 350
    } = options;

    return new Promise((resolve, reject) => {
        const encoder = new GIFEncoder(width, height);
        const stream = encoder.createReadStream();
        encoder.start();
        encoder.setRepeat(-1);
        encoder.setDelay(45);
        encoder.setQuality(10);

        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', (err) => reject(err));

        const canvas = Canvas.createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        const padding = { top: 50, right: 30, bottom: 50, left: 55 };
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;

        const maxValue = Math.max(...data, 1);
        const minValue = 0;
        const valueRange = maxValue - minValue || 1;

        const points = data.map((value, index) => ({
            x: padding.left + (index / (data.length - 1 || 1)) * chartWidth,
            y: padding.top + chartHeight - ((value - minValue) / valueRange) * chartHeight
        }));

        const totalFrames = Math.min(data.length * 2, 25);

        for (let frame = 0; frame <= totalFrames; frame++) {
            const progress = frame / totalFrames;
            const pointsToDraw = Math.ceil(progress * data.length);

            const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
            bgGradient.addColorStop(0, COLORS.background);
            bgGradient.addColorStop(1, COLORS.backgroundAlt);
            ctx.fillStyle = bgGradient;
            ctx.fillRect(0, 0, width, height);

            if (title) {
                ctx.fillStyle = COLORS.text;
                ctx.font = FONTS.title;
                ctx.textAlign = 'left';
                ctx.fillText(title, padding.left, 35);
            }

            const gridLines = 5;
            for (let i = 0; i <= gridLines; i++) {
                const y = padding.top + (i / gridLines) * chartHeight;

                ctx.strokeStyle = COLORS.grid;
                ctx.lineWidth = 1;
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.moveTo(padding.left, y);
                ctx.lineTo(width - padding.right, y);
                ctx.stroke();
                ctx.setLineDash([]);

                const value = maxValue - (i / gridLines) * valueRange;
                ctx.fillStyle = COLORS.textDim;
                ctx.font = FONTS.small;
                ctx.textAlign = 'right';
                ctx.fillText(formatNumber(value), padding.left - 12, y + 4);
            }

            if (labels && labels.length > 0) {
                ctx.fillStyle = COLORS.textDim;
                ctx.font = FONTS.small;
                ctx.textAlign = 'center';

                const maxLabels = 8;
                const step = Math.max(1, Math.ceil(labels.length / maxLabels));

                for (let i = 0; i < labels.length; i += step) {
                    const x = padding.left + (i / (labels.length - 1 || 1)) * chartWidth;
                    ctx.fillText(labels[i], x, height - padding.bottom + 25);
                }
            }

            ctx.strokeStyle = COLORS.grid;
            ctx.lineWidth = 1;
            ctx.strokeRect(padding.left, padding.top, chartWidth, chartHeight);

            if (pointsToDraw > 1) {
                ctx.strokeStyle = COLORS.accentGlow;
                ctx.lineWidth = 8;
                ctx.globalAlpha = 0.15;
                ctx.lineJoin = 'round';
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(points[0].x, points[0].y);
                for (let i = 1; i < pointsToDraw; i++) {
                    ctx.lineTo(points[i].x, points[i].y);
                }
                ctx.stroke();
                ctx.globalAlpha = 1;

                const gradient = ctx.createLinearGradient(padding.left, 0, width - padding.right, 0);
                gradient.addColorStop(0, COLORS.gradientStart);
                gradient.addColorStop(1, COLORS.gradientEnd);

                ctx.strokeStyle = gradient;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(points[0].x, points[0].y);
                for (let i = 1; i < pointsToDraw; i++) {
                    ctx.lineTo(points[i].x, points[i].y);
                }
                ctx.stroke();

                for (let i = 0; i < pointsToDraw; i++) {
                    const p = points[i];

                    ctx.beginPath();
                    ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(88, 166, 255, 0.2)';
                    ctx.fill();

                    ctx.beginPath();
                    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
                    ctx.fillStyle = COLORS.accent;
                    ctx.fill();
                    ctx.strokeStyle = COLORS.text;
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                }
            }

            encoder.addFrame(ctx);
        }

        for (let i = 0; i < 10; i++) {
            encoder.addFrame(ctx);
        }

        encoder.finish();
    });
}

async function renderBarChart(options) {
    const {
        data,
        labels,
        title = '',
        width = 800,
        height = 350
    } = options;

    return new Promise((resolve, reject) => {
        const encoder = new GIFEncoder(width, height);
        const stream = encoder.createReadStream();
        encoder.start();
        encoder.setRepeat(-1);
        encoder.setDelay(35);
        encoder.setQuality(10);

        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', (err) => reject(err));

        const canvas = Canvas.createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        const padding = { top: 50, right: 20, bottom: 50, left: 50 };
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;

        const maxValue = Math.max(...data, 1);
        const barCount = data.length;
        const totalBarSpace = chartWidth / barCount;
        const barWidth = totalBarSpace * 0.75;
        const barGap = totalBarSpace * 0.25;

        const totalFrames = 18;

        for (let frame = 0; frame <= totalFrames; frame++) {
            const progress = easeOutCubic(frame / totalFrames);

            const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
            bgGradient.addColorStop(0, COLORS.background);
            bgGradient.addColorStop(1, COLORS.backgroundAlt);
            ctx.fillStyle = bgGradient;
            ctx.fillRect(0, 0, width, height);

            if (title) {
                ctx.fillStyle = COLORS.text;
                ctx.font = FONTS.value;
                ctx.textAlign = 'left';
                ctx.fillText(title, 20, 30);
            }

            const gridLines = 4;
            for (let i = 0; i <= gridLines; i++) {
                const y = padding.top + (i / gridLines) * chartHeight;

                ctx.strokeStyle = COLORS.grid;
                ctx.lineWidth = 1;
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.moveTo(padding.left, y);
                ctx.lineTo(width - padding.right, y);
                ctx.stroke();
                ctx.setLineDash([]);

                const value = maxValue - (i / gridLines) * maxValue;
                ctx.fillStyle = COLORS.textDim;
                ctx.font = FONTS.small;
                ctx.textAlign = 'right';
                ctx.fillText(formatNumber(value), padding.left - 10, y + 4);
            }

            const peakIndex = data.indexOf(Math.max(...data));

            for (let i = 0; i < barCount; i++) {
                const barHeight = (data[i] / maxValue) * chartHeight * progress;
                const x = padding.left + i * totalBarSpace + barGap / 2;
                const y = padding.top + chartHeight - barHeight;

                const isPeak = i === peakIndex;
                const gradient = ctx.createLinearGradient(x, y + barHeight, x, y);

                if (isPeak) {
                    gradient.addColorStop(0, '#d29922');
                    gradient.addColorStop(1, '#f0b429');
                } else {
                    gradient.addColorStop(0, COLORS.barGradientStart);
                    gradient.addColorStop(1, COLORS.barGradientEnd);
                }

                ctx.fillStyle = 'rgba(0,0,0,0.25)';
                roundRect(ctx, x + 2, y + 2, barWidth, barHeight, 3);
                ctx.fill();

                ctx.fillStyle = gradient;
                roundRect(ctx, x, y, barWidth, barHeight, 3);
                ctx.fill();

                if (labels && labels[i] && (i % 3 === 0 || barCount <= 12)) {
                    ctx.fillStyle = isPeak ? COLORS.warning : COLORS.textDim;
                    ctx.font = isPeak ? FONTS.label : FONTS.tiny;
                    ctx.textAlign = 'center';
                    ctx.fillText(labels[i].replace(':00', 'h'), x + barWidth / 2, height - padding.bottom + 20);
                }

                if (progress > 0.9 && data[i] > 0 && (isPeak || data[i] > maxValue * 0.7)) {
                    ctx.fillStyle = COLORS.text;
                    ctx.font = FONTS.small;
                    ctx.textAlign = 'center';
                    ctx.fillText(formatNumber(data[i]), x + barWidth / 2, y - 8);
                }
            }

            encoder.addFrame(ctx);
        }

        for (let i = 0; i < 12; i++) {
            encoder.addFrame(ctx);
        }

        encoder.finish();
    });
}

async function renderStatsCard(options) {
    const {
        stats,
        title = '',
        width = 450,
        height = 220
    } = options;

    const canvas = Canvas.createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
    bgGradient.addColorStop(0, COLORS.background);
    bgGradient.addColorStop(1, COLORS.backgroundAlt);
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, width, height);

    if (title) {
        ctx.fillStyle = COLORS.text;
        ctx.font = FONTS.title;
        ctx.textAlign = 'left';
        ctx.fillText(title, 25, 40);
    }

    const startY = title ? 75 : 45;
    const statHeight = (height - startY - 25) / stats.length;

    stats.forEach((stat, i) => {
        const y = startY + i * statHeight;

        ctx.fillStyle = COLORS.textDim;
        ctx.font = FONTS.label;
        ctx.textAlign = 'left';
        ctx.fillText(stat.label, 25, y + 18);

        ctx.fillStyle = stat.color || COLORS.text;
        ctx.font = FONTS.value;
        ctx.textAlign = 'right';
        ctx.fillText(stat.value, width - 25, y + 18);

        if (i < stats.length - 1) {
            ctx.strokeStyle = COLORS.grid;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(25, y + statHeight - 5);
            ctx.lineTo(width - 25, y + statHeight - 5);
            ctx.stroke();
        }
    });

    return canvas.toBuffer();
}

function roundRect(ctx, x, y, width, height, radius) {
    if (height <= 0) return;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height);
    ctx.lineTo(x, y + height);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

function formatNumber(num) {
    return funcs.abbr(num, 1000);
}

function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
}
//
module.exports = {
    renderLineChart,
    renderBarChart,
    renderStatsCard,
    COLORS
};
