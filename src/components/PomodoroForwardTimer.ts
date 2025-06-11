import { showMessage } from "siyuan";
import { PomodoroRecordManager } from "../utils/pomodoroRecord";
import { readReminderData, writeReminderData } from "../api";

export class PomodoroForwardTimer {
    private reminder: any;
    private settings: any;
    private container: HTMLElement;
    private timeDisplay: HTMLElement;
    private statusDisplay: HTMLElement;
    private progressBar: HTMLElement;
    private startPauseBtn: HTMLElement;
    private stopBtn: HTMLElement;
    private circularProgress: HTMLElement;
    private expandToggleBtn: HTMLElement;
    private statsContainer: HTMLElement;
    private todayFocusDisplay: HTMLElement;
    private weekFocusDisplay: HTMLElement;
    private pomodoroCountDisplay: HTMLElement;

    private isRunning: boolean = false;
    private isPaused: boolean = false;
    private isWorkPhase: boolean = true;
    private isLongBreak: boolean = false;
    private timeElapsed: number = 0; // 正计时：已经过的时间
    private breakTimeLeft: number = 0; // 休息倒计时：剩余时间
    private completedPomodoros: number = 0; // 完成的番茄数量
    private timer: number = null;
    private isExpanded: boolean = true;
    private startTime: number = 0; // 记录开始时间

    private workAudio: HTMLAudioElement = null;
    private breakAudio: HTMLAudioElement = null;
    private longBreakAudio: HTMLAudioElement = null;
    private endAudio: HTMLAudioElement = null;
    private recordManager: PomodoroRecordManager;
    private audioInitialized: boolean = false;

    constructor(reminder: any, settings: any) {
        this.reminder = reminder;
        this.settings = settings;
        this.recordManager = PomodoroRecordManager.getInstance();

        this.initComponents();
    }

    private async initComponents() {
        await this.recordManager.initialize();
        this.initAudio();
        this.createWindow();
        this.updateStatsDisplay();
    }

    private initAudio() {
        // 初始化工作背景音
        if (this.settings.workSound) {
            try {
                this.workAudio = new Audio(this.settings.workSound);
                this.workAudio.loop = true;
                this.workAudio.volume = 1;
                this.workAudio.preload = 'auto';
            } catch (error) {
                console.warn('无法加载工作背景音:', error);
            }
        }

        // 初始化短时休息背景音
        if (this.settings.breakSound) {
            try {
                this.breakAudio = new Audio(this.settings.breakSound);
                this.breakAudio.loop = true;
                this.breakAudio.volume = 1;
                this.breakAudio.preload = 'auto';
            } catch (error) {
                console.warn('无法加载短时休息背景音:', error);
            }
        }

        // 初始化长时休息背景音
        if (this.settings.longBreakSound) {
            try {
                this.longBreakAudio = new Audio(this.settings.longBreakSound);
                this.longBreakAudio.loop = true;
                this.longBreakAudio.volume = 1;
                this.longBreakAudio.preload = 'auto';
            } catch (error) {
                console.warn('无法加载长时休息背景音:', error);
            }
        }

        // 初始化结束提示音
        if (this.settings.endSound) {
            try {
                this.endAudio = new Audio(this.settings.endSound);
                this.endAudio.volume = 1;
                this.endAudio.preload = 'auto';
            } catch (error) {
                console.warn('无法加载结束提示音:', error);
            }
        }
    }

    private async initializeAudioPlayback() {
        if (this.audioInitialized) return;

        try {
            const silentAudio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA');
            await silentAudio.play();
            silentAudio.pause();

            const audioPromises = [];
            if (this.workAudio) {
                audioPromises.push(this.workAudio.load());
            }
            if (this.breakAudio) {
                audioPromises.push(this.breakAudio.load());
            }
            if (this.longBreakAudio) {
                audioPromises.push(this.longBreakAudio.load());
            }
            if (this.endAudio) {
                audioPromises.push(this.endAudio.load());
            }

            await Promise.allSettled(audioPromises);
            this.audioInitialized = true;
            console.log('音频播放权限已获取');
        } catch (error) {
            console.warn('无法获取音频播放权限:', error);
        }
    }

    private async safePlayAudio(audio: HTMLAudioElement) {
        if (!audio) return;

        try {
            if (!this.audioInitialized) {
                await this.initializeAudioPlayback();
            }
            await audio.play();
        } catch (error) {
            console.warn('音频播放失败:', error);
            if (error.name === 'NotAllowedError') {
                console.log('尝试重新获取音频播放权限...');
                this.audioInitialized = false;
            }
        }
    }

    private createWindow() {
        // 创建悬浮窗口容器
        this.container = document.createElement('div');
        this.container.className = 'pomodoro-forward-timer-window';
        this.container.style.cssText = `
            position: fixed;
            top: 100px;
            right: 20px;
            width: 220px;
            background: var(--b3-theme-background);
            border: 1px solid var(--b3-theme-border);
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
            z-index: 10000;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            user-select: none;
            backdrop-filter: blur(16px);
            transition: transform 0.2s ease, opacity 0.2s ease;
            overflow: hidden;
        `;

        // 标题栏
        const header = document.createElement('div');
        header.className = 'pomodoro-header';
        header.style.cssText = `
            padding: 12px 16px;
            background: var(--b3-theme-surface);
            border-radius: 12px 12px 0 0;
            border-bottom: 1px solid var(--b3-theme-border);
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: move;
        `;

        const title = document.createElement('div');
        title.className = 'pomodoro-title';
        title.style.cssText = `
            font-size: 14px;
            font-weight: 600;
            color: var(--b3-theme-on-surface);
            display: flex;
            align-items: center;
            gap: 8px;
        `;
        title.innerHTML = `<span style="font-size: 16px;">⏰</span><span></span>`;

        const headerButtons = document.createElement('div');
        headerButtons.style.cssText = `
            display: flex;
            align-items: center;
            gap: 4px;
        `;

        // 工作时间按钮
        const workBtn = document.createElement('button');
        workBtn.className = 'pomodoro-work-btn';
        workBtn.style.cssText = `
            background: none;
            border: none;
            color: var(--b3-theme-on-surface);
            cursor: pointer;
            padding: 4px;
            border-radius: 4px;
            font-size: 14px;
            line-height: 1;
            opacity: 0.7;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        workBtn.innerHTML = '💪';
        workBtn.title = '工作时间';
        workBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.startWorkTime();
        });

        // 短时休息按钮
        const shortBreakBtn = document.createElement('button');
        shortBreakBtn.className = 'pomodoro-break-btn';
        shortBreakBtn.style.cssText = `
            background: none;
            border: none;
            color: var(--b3-theme-on-surface);
            cursor: pointer;
            padding: 4px;
            border-radius: 4px;
            font-size: 14px;
            line-height: 1;
            opacity: 0.7;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        shortBreakBtn.innerHTML = '🍵';
        shortBreakBtn.title = '短时休息';
        shortBreakBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.startShortBreak();
        });

        // 长时休息按钮
        const longBreakBtn = document.createElement('button');
        longBreakBtn.className = 'pomodoro-break-btn';
        longBreakBtn.style.cssText = `
            background: none;
            border: none;
            color: var(--b3-theme-on-surface);
            cursor: pointer;
            padding: 4px;
            border-radius: 4px;
            font-size: 14px;
            line-height: 1;
            opacity: 0.7;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        longBreakBtn.innerHTML = '🧘';
        longBreakBtn.title = '长时休息';
        longBreakBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.startLongBreak();
        });

        // 展开/折叠按钮
        this.expandToggleBtn = document.createElement('button');
        this.expandToggleBtn.className = 'pomodoro-expand-toggle';
        this.expandToggleBtn.style.cssText = `
            background: none;
            border: none;
            color: var(--b3-theme-on-surface);
            cursor: pointer;
            padding: 4px;
            border-radius: 4px;
            font-size: 14px;
            line-height: 1;
            opacity: 0.7;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        this.expandToggleBtn.innerHTML = this.isExpanded ? '📉' : '📈';
        this.expandToggleBtn.title = this.isExpanded ? '折叠' : '展开';
        this.expandToggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggleExpand();
        });

        const closeBtn = document.createElement('button');
        closeBtn.className = 'pomodoro-close';
        closeBtn.style.cssText = `
            background: none;
            border: none;
            color: var(--b3-theme-on-surface);
            cursor: pointer;
            padding: 4px;
            border-radius: 4px;
            font-size: 16px;
            line-height: 1;
            opacity: 0.7;
            transition: opacity 0.2s;
        `;
        closeBtn.innerHTML = '×';
        closeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.close();
        });

        headerButtons.appendChild(workBtn);
        headerButtons.appendChild(shortBreakBtn);
        headerButtons.appendChild(longBreakBtn);
        headerButtons.appendChild(this.expandToggleBtn);
        headerButtons.appendChild(closeBtn);
        header.appendChild(title);
        header.appendChild(headerButtons);

        // 主体内容
        const content = document.createElement('div');
        content.className = 'pomodoro-content';
        content.style.cssText = `
            padding: 16px;
        `;

        // 事件名称显示
        const eventTitle = document.createElement('div');
        eventTitle.className = 'pomodoro-event-title';
        eventTitle.style.cssText = `
            font-size: 14px;
            font-weight: 600;
            color: var(--b3-theme-on-surface);
            text-align: center;
            border-radius: 6px;
            border: 1px solid var(--b3-theme-border);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        `;
        eventTitle.textContent = this.reminder.title || '番茄专注';
        eventTitle.title = this.reminder.title || '番茄专注';

        // 主要布局容器
        const mainContainer = document.createElement('div');
        mainContainer.style.cssText = `
            display: flex;
            align-items: center;
            gap: 16px;
            margin-bottom: 10px;
        `;

        // 左侧圆环进度条
        const progressContainer = document.createElement('div');
        progressContainer.style.cssText = `
            position: relative;
            width: 80px;
            height: 80px;
            flex-shrink: 0;
        `;

        // 创建 SVG 圆环
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.style.cssText = `
            width: 80px;
            height: 80px;
            transform: rotate(-90deg);
        `;
        svg.setAttribute('viewBox', '0 0 80 80');

        // 背景圆环
        const bgCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        bgCircle.setAttribute('cx', '40');
        bgCircle.setAttribute('cy', '40');
        bgCircle.setAttribute('r', '36');
        bgCircle.setAttribute('fill', 'none');
        bgCircle.setAttribute('stroke', '#e0e0e0');
        bgCircle.setAttribute('stroke-width', '6');
        bgCircle.setAttribute('opacity', '0.3');

        // 进度圆环
        this.circularProgress = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        this.circularProgress.setAttribute('cx', '40');
        this.circularProgress.setAttribute('cy', '40');
        this.circularProgress.setAttribute('r', '36');
        this.circularProgress.setAttribute('fill', 'none');
        this.circularProgress.setAttribute('stroke', '#FF6B6B');
        this.circularProgress.setAttribute('stroke-width', '6');
        this.circularProgress.setAttribute('stroke-linecap', 'round');

        const circumference = 2 * Math.PI * 36;
        this.circularProgress.style.cssText = `
            stroke-dasharray: ${circumference};
            stroke-dashoffset: ${circumference};
            transition: stroke-dashoffset 0.3s ease, stroke 0.3s ease;
        `;

        svg.appendChild(bgCircle);
        svg.appendChild(this.circularProgress);

        // 圆环中心的控制按钮容器
        const centerContainer = document.createElement('div');
        centerContainer.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 2px;
        `;

        this.startPauseBtn = document.createElement('button');
        this.startPauseBtn.className = 'circle-control-btn';
        this.startPauseBtn.style.cssText = `
            background: none;
            border: none;
            cursor: pointer;
            font-size: 20px;
            color: var(--b3-theme-on-surface);
            padding: 6px;
            border-radius: 50%;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 36px;
            height: 36px;
        `;
        this.startPauseBtn.innerHTML = '▶️';
        this.startPauseBtn.addEventListener('click', () => this.toggleTimer());

        this.stopBtn = document.createElement('button');
        this.stopBtn.className = 'circle-control-btn';
        this.stopBtn.style.cssText = `
            background: none;
            border: none;
            cursor: pointer;
            font-size: 16px;
            color: var(--b3-theme-on-surface);
            padding: 6px;
            border-radius: 50%;
            transition: all 0.2s;
            display: none;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
        `;
        this.stopBtn.innerHTML = '⏹';
        this.stopBtn.addEventListener('click', () => this.resetTimer());

        centerContainer.appendChild(this.startPauseBtn);
        centerContainer.appendChild(this.stopBtn);

        progressContainer.appendChild(svg);
        progressContainer.appendChild(centerContainer);

        // 右侧时间和状态信息
        const timeInfo = document.createElement('div');
        timeInfo.style.cssText = `
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 4px;
        `;

        this.statusDisplay = document.createElement('div');
        this.statusDisplay.className = 'pomodoro-status';
        this.statusDisplay.style.cssText = `
            font-size: 12px;
            color: var(--b3-theme-on-surface-variant);
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        `;
        this.statusDisplay.textContent = '工作时间';

        this.timeDisplay = document.createElement('div');
        this.timeDisplay.className = 'pomodoro-time';
        this.timeDisplay.style.cssText = `
            font-size: 24px;
            font-weight: 700;
            color: var(--b3-theme-on-surface);
            font-variant-numeric: tabular-nums;
            line-height: 1.2;
            cursor: pointer;
            user-select: none;
            border-radius: 4px;
            padding: 2px 4px;
            transition: background-color 0.2s;
        `;
        this.timeDisplay.title = '双击编辑休息时间';

        // 添加双击事件监听器
        this.timeDisplay.addEventListener('dblclick', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.editBreakTime();
        });

        // 添加悬停效果
        this.timeDisplay.addEventListener('mouseenter', () => {
            if (!this.isWorkPhase) {
                this.timeDisplay.style.backgroundColor = 'var(--b3-theme-surface-hover)';
            }
        });
        this.timeDisplay.addEventListener('mouseleave', () => {
            this.timeDisplay.style.backgroundColor = 'transparent';
        });

        // 番茄数量显示
        this.pomodoroCountDisplay = document.createElement('div');
        this.pomodoroCountDisplay.className = 'pomodoro-count';
        this.pomodoroCountDisplay.style.cssText = `
            font-size: 14px;
            color: var(--b3-theme-on-surface-variant);
            display: flex;
            align-items: center;
            gap: 4px;
        `;

        timeInfo.appendChild(this.statusDisplay);
        timeInfo.appendChild(this.timeDisplay);
        timeInfo.appendChild(this.pomodoroCountDisplay);

        mainContainer.appendChild(progressContainer);
        mainContainer.appendChild(timeInfo);

        // 统计信息容器
        this.statsContainer = document.createElement('div');
        this.statsContainer.className = 'pomodoro-stats';
        this.statsContainer.style.cssText = `
            display: ${this.isExpanded ? 'flex' : 'none'};
            justify-content: space-between;
            padding: 12px;
            background: var(--b3-theme-surface);
            border-radius: 8px;
            transition: all 0.3s ease;
        `;

        const todayStats = document.createElement('div');
        todayStats.style.cssText = `
            flex: 1;
            text-align: center;
            padding: 0 8px;
        `;

        const todayLabel = document.createElement('div');
        todayLabel.style.cssText = `
            font-size: 11px;
            color: var(--b3-theme-on-surface-variant);
            margin-bottom: 4px;
        `;
        todayLabel.textContent = '今日专注';

        this.todayFocusDisplay = document.createElement('div');
        this.todayFocusDisplay.style.cssText = `
            font-size: 16px;
            font-weight: 600;
            color: #FF6B6B;
        `;

        todayStats.appendChild(todayLabel);
        todayStats.appendChild(this.todayFocusDisplay);

        const weekStats = document.createElement('div');
        weekStats.style.cssText = `
            flex: 1;
            text-align: center;
            padding: 0 8px;
            border-left: 1px solid var(--b3-theme-border);
        `;

        const weekLabel = document.createElement('div');
        weekLabel.style.cssText = `
            font-size: 11px;
            color: var(--b3-theme-on-surface-variant);
            margin-bottom: 4px;
        `;
        weekLabel.textContent = '本周专注';

        this.weekFocusDisplay = document.createElement('div');
        this.weekFocusDisplay.style.cssText = `
            font-size: 16px;
            font-weight: 600;
            color: #4CAF50;
        `;

        weekStats.appendChild(weekLabel);
        weekStats.appendChild(this.weekFocusDisplay);

        this.statsContainer.appendChild(todayStats);
        this.statsContainer.appendChild(weekStats);

        content.appendChild(eventTitle);
        content.appendChild(mainContainer);
        content.appendChild(this.statsContainer);

        this.container.appendChild(header);
        this.container.appendChild(content);

        // 添加拖拽功能
        this.makeDraggable(header);

        // 更新显示
        this.updateDisplay();

        document.body.appendChild(this.container);
    }

    private makeDraggable(handle: HTMLElement) {
        let isDragging = false;
        let currentX = 0;
        let currentY = 0;
        let initialX = 0;
        let initialY = 0;

        handle.addEventListener('mousedown', (e) => {
            if (e.target.closest('button')) {
                return;
            }

            e.preventDefault();
            isDragging = true;

            const rect = this.container.getBoundingClientRect();
            initialX = e.clientX - rect.left;
            initialY = e.clientY - rect.top;

            this.container.style.transition = 'none';
            this.container.style.pointerEvents = 'none';

            const buttons = this.container.querySelectorAll('button');
            buttons.forEach(btn => {
                btn.style.pointerEvents = 'auto';
            });

            document.addEventListener('mousemove', drag);
            document.addEventListener('mouseup', stopDrag);
        });

        const drag = (e) => {
            if (!isDragging) return;

            e.preventDefault();
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;

            const maxX = window.innerWidth - this.container.offsetWidth;
            const maxY = window.innerHeight - this.container.offsetHeight;

            currentX = Math.max(0, Math.min(currentX, maxX));
            currentY = Math.max(0, Math.min(currentY, maxY));

            this.container.style.left = currentX + 'px';
            this.container.style.top = currentY + 'px';
            this.container.style.right = 'auto';
        };

        const stopDrag = () => {
            isDragging = false;
            this.container.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
            this.container.style.pointerEvents = 'auto';

            document.removeEventListener('mousemove', drag);
            document.removeEventListener('mouseup', stopDrag);
        };
    }

    private toggleExpand() {
        this.isExpanded = !this.isExpanded;

        if (this.isExpanded) {
            this.statsContainer.style.display = 'flex';
            this.expandToggleBtn.innerHTML = '📉';
            this.expandToggleBtn.title = '折叠';
            this.container.style.height = 'auto';
        } else {
            this.statsContainer.style.display = 'none';
            this.expandToggleBtn.innerHTML = '📈';
            this.expandToggleBtn.title = '展开';
            this.container.style.height = 'auto';
        }

        if (this.isExpanded) {
            this.updateStatsDisplay();
        }
    }

    private async updateStatsDisplay() {
        if (!this.isExpanded) return;

        try {
            const todayTime = this.recordManager.getTodayFocusTime();
            const weekTime = this.recordManager.getWeekFocusTime();

            this.todayFocusDisplay.textContent = this.recordManager.formatTime(todayTime);
            this.weekFocusDisplay.textContent = this.recordManager.formatTime(weekTime);
        } catch (error) {
            console.error('更新统计显示失败:', error);
            this.todayFocusDisplay.textContent = '0m';
            this.weekFocusDisplay.textContent = '0m';
        }
    }

    private updateDisplay() {
        let displayTime: number;
        let minutes: number;
        let seconds: number;

        if (this.isWorkPhase) {
            // 工作时间：正计时显示
            displayTime = this.timeElapsed;
            minutes = Math.floor(displayTime / 60);
            seconds = displayTime % 60;
        } else {
            // 休息时间：倒计时显示
            displayTime = this.breakTimeLeft;
            minutes = Math.floor(displayTime / 60);
            seconds = displayTime % 60;
        }

        this.timeDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

        // 进度条逻辑
        let progress: number;
        const circumference = 2 * Math.PI * 36;

        if (this.isWorkPhase) {
            // 工作时间：根据番茄时长计算当前番茄的进度
            const pomodoroLength = this.settings.workDuration * 60;
            const currentCycleTime = this.timeElapsed % pomodoroLength;
            progress = currentCycleTime / pomodoroLength;
        } else {
            // 休息时间：倒计时进度
            const totalBreakTime = this.isLongBreak ?
                this.settings.longBreakDuration * 60 :
                this.settings.breakDuration * 60;
            progress = (totalBreakTime - this.breakTimeLeft) / totalBreakTime;
        }

        const offset = circumference * (1 - progress);
        this.circularProgress.style.strokeDashoffset = offset.toString();

        // 更新颜色和状态显示
        let color = '#FF6B6B';
        let statusText = '工作时间';

        if (!this.isWorkPhase) {
            if (this.isLongBreak) {
                color = '#9C27B0';
                statusText = '长时休息';
            } else {
                color = '#4CAF50';
                statusText = '短时休息';
            }
        }

        this.circularProgress.setAttribute('stroke', color);
        this.statusDisplay.textContent = statusText;

        // 更新番茄数量显示
        this.pomodoroCountDisplay.innerHTML = `🍅 ${this.completedPomodoros}`;

        // 更新按钮状态
        if (!this.isRunning) {
            this.startPauseBtn.innerHTML = '▶️';
            this.startPauseBtn.style.display = 'flex';
            this.startPauseBtn.style.width = '36px';
            this.startPauseBtn.style.height = '36px';
            this.startPauseBtn.style.fontSize = '20px';
            this.stopBtn.style.display = 'none';
        } else if (this.isPaused) {
            this.startPauseBtn.innerHTML = '▶️';
            this.startPauseBtn.style.display = 'flex';
            this.startPauseBtn.style.width = '28px';
            this.startPauseBtn.style.height = '28px';
            this.startPauseBtn.style.fontSize = '16px';
            this.stopBtn.style.display = 'flex';
            this.stopBtn.style.width = '28px';
            this.stopBtn.style.height = '28px';
            this.stopBtn.style.fontSize = '14px';
        } else {
            this.startPauseBtn.innerHTML = '⏸';
            this.startPauseBtn.style.display = 'flex';
            this.startPauseBtn.style.width = '36px';
            this.startPauseBtn.style.height = '36px';
            this.startPauseBtn.style.fontSize = '20px';
            this.stopBtn.style.display = 'none';
        }
    }

    private toggleTimer() {
        if (!this.audioInitialized) {
            this.initializeAudioPlayback();
        }

        if (!this.isRunning) {
            this.startTimer();
        } else {
            if (this.isPaused) {
                this.resumeTimer();
            } else {
                this.pauseTimer();
            }
        }
    }

    private async startTimer() {
        this.isRunning = true;
        this.isPaused = false;
        this.startTime = Date.now() - (this.timeElapsed * 1000);

        // 播放对应的背景音
        if (this.isWorkPhase && this.workAudio) {
            await this.safePlayAudio(this.workAudio);
        } else if (!this.isWorkPhase) {
            if (this.isLongBreak && this.longBreakAudio) {
                await this.safePlayAudio(this.longBreakAudio);
            } else if (!this.isLongBreak && this.breakAudio) {
                await this.safePlayAudio(this.breakAudio);
            }
        }

        this.timer = window.setInterval(() => {
            if (this.isWorkPhase) {
                // 工作时间：正计时
                this.timeElapsed++;

                // 检查是否完成一个番茄
                const pomodoroLength = this.settings.workDuration * 60;
                const currentCycleTime = this.timeElapsed % pomodoroLength;

                if (currentCycleTime === 0 && this.timeElapsed > 0) {
                    this.completePomodoroPhase();
                }
            } else {
                // 休息时间：倒计时
                this.breakTimeLeft--;

                // 检查休息时间是否结束
                if (this.breakTimeLeft <= 0) {
                    this.completeBreakPhase();
                }
            }

            this.updateDisplay();
        }, 1000);

        const phaseText = this.isWorkPhase ? '工作时间' : (this.isLongBreak ? '长时休息' : '短时休息');
        const modeText = this.isWorkPhase ? '正计时' : '倒计时';
        showMessage(`${phaseText}${modeText}已开始`);
    }

    private pauseTimer() {
        this.isPaused = true;

        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }

        // 暂停所有背景音
        if (this.workAudio) {
            this.workAudio.pause();
        }
        if (this.breakAudio) {
            this.breakAudio.pause();
        }
        if (this.longBreakAudio) {
            this.longBreakAudio.pause();
        }

        this.updateDisplay();
    }

    private async resumeTimer() {
        this.isPaused = false;
        this.startTime = Date.now() - (this.timeElapsed * 1000);

        // 恢复对应的背景音
        if (this.isWorkPhase && this.workAudio) {
            await this.safePlayAudio(this.workAudio);
        } else if (!this.isWorkPhase) {
            if (this.isLongBreak && this.longBreakAudio) {
                await this.safePlayAudio(this.longBreakAudio);
            } else if (!this.isLongBreak && this.breakAudio) {
                await this.safePlayAudio(this.breakAudio);
            }
        }

        this.timer = window.setInterval(() => {
            if (this.isWorkPhase) {
                // 工作时间：正计时
                this.timeElapsed++;

                const pomodoroLength = this.settings.workDuration * 60;
                const currentCycleTime = this.timeElapsed % pomodoroLength;

                if (currentCycleTime === 0 && this.timeElapsed > 0) {
                    this.completePomodoroPhase();
                }
            } else {
                // 休息时间：倒计时
                this.breakTimeLeft--;

                if (this.breakTimeLeft <= 0) {
                    this.completeBreakPhase();
                }
            }

            this.updateDisplay();
        }, 1000);
    }

    private async startWorkTime() {
        if (!this.audioInitialized) {
            await this.initializeAudioPlayback();
        }

        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }

        this.stopAllAudio();

        this.isWorkPhase = true;
        this.isLongBreak = false;
        this.isRunning = false;
        this.isPaused = false;
        this.timeElapsed = 0;
        this.completedPomodoros = 0;

        this.updateDisplay();
        showMessage('💪 开始工作正计时');
    }

    private async startShortBreak() {
        if (!this.audioInitialized) {
            await this.initializeAudioPlayback();
        }

        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }

        this.stopAllAudio();

        this.isWorkPhase = false;
        this.isLongBreak = false;
        this.isRunning = false;
        this.isPaused = false;
        this.timeElapsed = 0;
        this.breakTimeLeft = this.settings.breakDuration * 60; // 设置短时休息倒计时

        this.updateDisplay();
        showMessage('🍵 开始短时休息倒计时');
    }

    private async startLongBreak() {
        if (!this.audioInitialized) {
            await this.initializeAudioPlayback();
        }

        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }

        this.stopAllAudio();

        this.isWorkPhase = false;
        this.isLongBreak = true;
        this.isRunning = false;
        this.isPaused = false;
        this.timeElapsed = 0;
        this.breakTimeLeft = this.settings.longBreakDuration * 60; // 设置长时休息倒计时

        this.updateDisplay();
        showMessage('🧘 开始长时休息倒计时');
    }

    private resetTimer() {
        this.isRunning = false;
        this.isPaused = false;
        this.isWorkPhase = true;
        this.isLongBreak = false;
        this.timeElapsed = 0;
        this.breakTimeLeft = 0;
        this.completedPomodoros = 0;
        this.statusDisplay.textContent = '工作时间';

        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }

        this.stopAllAudio();
        this.updateDisplay();
    }

    /**
     * 完成休息阶段
     */
    private async completeBreakPhase() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }

        // 停止所有背景音
        this.stopAllAudio();

        // 播放结束提示音
        if (this.endAudio) {
            await this.safePlayAudio(this.endAudio);
        }

        // 记录完成的休息时间
        const breakDuration = this.isLongBreak ? this.settings.longBreakDuration : this.settings.breakDuration;
        const eventId = this.reminder.isRepeatInstance ? this.reminder.originalId : this.reminder.id;
        const eventTitle = this.reminder.title || '番茄专注';

        console.log('开始记录休息会话...');
        await this.recordManager.recordBreakSession(
            breakDuration,
            eventId,
            eventTitle,
            breakDuration,
            this.isLongBreak,
            true // 完成状态
        );

        const breakType = this.isLongBreak ? '长时休息' : '短时休息';
        showMessage(`☕ ${breakType}结束！可以开始下一个工作阶段`, 3000);

        // 切换到工作阶段
        this.isWorkPhase = true;
        this.isLongBreak = false;
        this.isRunning = false;
        this.isPaused = false;
        this.breakTimeLeft = 0;

        this.updateDisplay();

        // 延迟更新统计显示
        setTimeout(() => {
            this.updateStatsDisplay();
        }, 100);
    }

    private stopAllAudio() {
        if (this.workAudio) {
            this.workAudio.pause();
            this.workAudio.currentTime = 0;
        }
        if (this.breakAudio) {
            this.breakAudio.pause();
            this.breakAudio.currentTime = 0;
        }
        if (this.longBreakAudio) {
            this.longBreakAudio.pause();
            this.longBreakAudio.currentTime = 0;
        }
    }

    private async updateReminderPomodoroCount() {
        try {
            const reminderData = await readReminderData();

            let targetId: string;
            if (this.reminder.isRepeatInstance) {
                targetId = this.reminder.originalId;
            } else {
                targetId = this.reminder.id;
            }

            if (reminderData[targetId]) {
                if (typeof reminderData[targetId].pomodoroCount !== 'number') {
                    reminderData[targetId].pomodoroCount = 0;
                }

                reminderData[targetId].pomodoroCount++;
                await writeReminderData(reminderData);
                window.dispatchEvent(new CustomEvent('reminderUpdated'));

                console.log(`提醒 ${targetId} 的番茄数量已更新为: ${reminderData[targetId].pomodoroCount}`);
            } else {
                console.warn('未找到对应的提醒项:', targetId);
            }
        } catch (error) {
            console.error('更新提醒番茄数量失败:', error);
        }
    }

    /**
     * 编辑休息时间功能（仅限休息阶段）
     */
    private editBreakTime() {
        // 只能在休息阶段编辑时间
        if (this.isWorkPhase) {
            return;
        }

        // 如果正在运行且未暂停，则不允许编辑
        if (this.isRunning && !this.isPaused) {
            showMessage('请先暂停计时器再编辑时间', 2000);
            return;
        }

        // 获取当前剩余时间（分钟）
        const currentMinutes = Math.floor(this.breakTimeLeft / 60);
        const currentSeconds = this.breakTimeLeft % 60;
        const currentTimeString = `${currentMinutes.toString().padStart(2, '0')}:${currentSeconds.toString().padStart(2, '0')}`;

        // 创建输入框
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentTimeString;
        input.style.cssText = `
            font-size: 24px;
            font-weight: 700;
            color: var(--b3-theme-on-surface);
            background: var(--b3-theme-surface);
            border: 2px solid var(--b3-theme-primary);
            border-radius: 4px;
            padding: 2px 4px;
            width: 80px;
            text-align: center;
            font-variant-numeric: tabular-nums;
            outline: none;
        `;
        input.placeholder = 'MM:SS';

        // 替换时间显示
        const parent = this.timeDisplay.parentNode;
        parent.replaceChild(input, this.timeDisplay);
        input.focus();
        input.select();

        // 处理输入完成
        const finishEdit = () => {
            const inputValue = input.value.trim();
            let newTimeInSeconds = this.parseTimeStringToSeconds(inputValue);

            if (newTimeInSeconds === null) {
                showMessage('时间格式无效，请使用 MM:SS 格式（如 15:00）', 3000);
                parent.replaceChild(this.timeDisplay, input);
                return;
            }

            // 限制时间范围（1秒到99分59秒）
            if (newTimeInSeconds < 1 || newTimeInSeconds > 5999) {
                showMessage('休息时间必须在 00:01 到 99:59 之间', 3000);
                parent.replaceChild(this.timeDisplay, input);
                return;
            }

            // 更新剩余时间
            this.breakTimeLeft = newTimeInSeconds;

            // 同时更新对应的休息时间设置（以分钟为单位）
            const newDurationMinutes = Math.ceil(newTimeInSeconds / 60);
            if (this.isLongBreak) {
                this.settings.longBreakDuration = newDurationMinutes;
            } else {
                this.settings.breakDuration = newDurationMinutes;
            }

            // 恢复时间显示
            parent.replaceChild(this.timeDisplay, input);
            this.updateDisplay();

            const minutes = Math.floor(newTimeInSeconds / 60);
            const seconds = newTimeInSeconds % 60;
            const breakType = this.isLongBreak ? '长时休息' : '短时休息';
            showMessage(`${breakType}剩余时间已设置为 ${minutes}:${seconds.toString().padStart(2, '0')}`, 2000);
        };

        // 处理取消编辑
        const cancelEdit = () => {
            parent.replaceChild(this.timeDisplay, input);
        };

        // 事件监听
        input.addEventListener('blur', finishEdit);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                finishEdit();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelEdit();
            }
        });

        // 限制输入格式
        input.addEventListener('input', (e) => {
            let value = input.value;
            // 移除非数字和冒号字符
            value = value.replace(/[^0-9:]/g, '');

            // 确保格式为 MM:SS
            if (value.length > 5) {
                value = value.substring(0, 5);
            }

            // 自动添加冒号
            if (value.length === 2 && value.indexOf(':') === -1) {
                value += ':';
            }

            input.value = value;
        });
    }

    /**
     * 解析时间字符串为秒数（用于休息倒计时设置）
     */
    private parseTimeStringToSeconds(timeStr: string): number | null {
        if (!timeStr) return null;

        let minutes = 0;
        let seconds = 0;

        // MM:SS 格式
        if (timeStr.includes(':')) {
            const parts = timeStr.split(':');
            if (parts.length !== 2) return null;

            minutes = parseInt(parts[0], 10);
            seconds = parseInt(parts[1], 10);
        } else {
            // 纯数字，视为分钟
            minutes = parseInt(timeStr, 10);
            seconds = 0;
        }

        // 验证数值有效性
        if (isNaN(minutes) || isNaN(seconds)) return null;
        if (minutes < 0 || seconds < 0) return null;
        if (seconds >= 60) return null;

        return minutes * 60 + seconds;
    }

    /**
     * 解析时间字符串为分钟数（用于休息时间设置）
     */
    private parseTimeStringToMinutes(timeStr: string): number | null {
        const totalSeconds = this.parseTimeStringToSeconds(timeStr);
        if (totalSeconds === null) return null;

        // 向上取整到分钟
        return Math.ceil(totalSeconds / 60);
    }

    show() {
        // Already shown in createWindow
    }

    close() {
        if (this.timer) {
            clearInterval(this.timer);
        }

        this.stopAllAudio();
        if (this.endAudio) {
            this.endAudio.pause();
        }

        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
    }

    destroy() {
        this.close();
    }
}