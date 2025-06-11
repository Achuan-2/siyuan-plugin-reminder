import { showMessage } from "siyuan";
import { PomodoroRecordManager } from "../utils/pomodoroRecord";

export class PomodoroTimer {
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

    private isRunning: boolean = false;
    private isPaused: boolean = false;
    private isWorkPhase: boolean = true;
    private timeLeft: number = 0;
    private totalTime: number = 0;
    private timer: number = null;
    private isExpanded: boolean = true;

    private workAudio: HTMLAudioElement = null;
    private endAudio: HTMLAudioElement = null;
    private recordManager: PomodoroRecordManager;

    constructor(reminder: any, settings: any) {
        this.reminder = reminder;
        this.settings = settings;
        this.timeLeft = settings.workDuration * 60;
        this.totalTime = this.timeLeft;
        this.recordManager = PomodoroRecordManager.getInstance();

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
                this.workAudio.volume = 0.3;
            } catch (error) {
                console.warn('无法加载工作背景音:', error);
            }
        }

        // 初始化结束提示音
        if (this.settings.endSound) {
            try {
                this.endAudio = new Audio(this.settings.endSound);
                this.endAudio.volume = 0.7;
            } catch (error) {
                console.warn('无法加载结束提示音:', error);
            }
        }
    }

    private createWindow() {
        // 创建悬浮窗口容器
        this.container = document.createElement('div');
        this.container.className = 'pomodoro-timer-window';
        this.container.style.cssText = `
            position: fixed;
            top: 100px;
            right: 20px;
            width: 320px;
            background: var(--b3-theme-background);
            border: 1px solid var(--b3-theme-border);
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
            z-index: 10000;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            user-select: none;
            backdrop-filter: blur(16px);
            transition: all 0.3s ease;
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
        title.innerHTML = `<span style="font-size: 16px;">🍅</span><span>${this.reminder.title || '番茄专注'}</span>`;

        const headerButtons = document.createElement('div');
        headerButtons.style.cssText = `
            display: flex;
            align-items: center;
            gap: 4px;
        `;

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
        this.expandToggleBtn.addEventListener('click', () => this.toggleExpand());

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
        closeBtn.addEventListener('click', () => this.close());

        headerButtons.appendChild(this.expandToggleBtn);
        headerButtons.appendChild(closeBtn);
        header.appendChild(title);
        header.appendChild(headerButtons);

        // 主体内容
        const content = document.createElement('div');
        content.className = 'pomodoro-content';
        content.style.cssText = `
            padding: 20px;
        `;

        // 圆环进度条容器
        const progressContainer = document.createElement('div');
        progressContainer.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 20px;
        `;

        // 左侧时间和状态信息
        const timeInfo = document.createElement('div');
        timeInfo.style.cssText = `
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 8px;
        `;

        this.statusDisplay = document.createElement('div');
        this.statusDisplay.className = 'pomodoro-status';
        this.statusDisplay.style.cssText = `
            font-size: 12px;
            color: var(--b3-theme-on-surface-variant);
            font-weight: 500;
        `;
        this.statusDisplay.textContent = '工作时间';

        this.timeDisplay = document.createElement('div');
        this.timeDisplay.className = 'pomodoro-time';
        this.timeDisplay.style.cssText = `
            font-size: 28px;
            font-weight: 700;
            color: var(--b3-theme-on-surface);
            font-variant-numeric: tabular-nums;
            line-height: 1;
        `;

        timeInfo.appendChild(this.statusDisplay);
        timeInfo.appendChild(this.timeDisplay);

        // 右侧圆环进度条
        const circularContainer = document.createElement('div');
        circularContainer.style.cssText = `
            position: relative;
            width: 80px;
            height: 80px;
            margin-left: 20px;
        `;

        this.circularProgress = document.createElement('div');
        this.circularProgress.className = 'circular-progress';
        this.circularProgress.style.cssText = `
            width: 80px;
            height: 80px;
            border-radius: 50%;
            background: conic-gradient(#FF6B6B 0deg, var(--b3-theme-surface-variant) 0deg);
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
            transition: background 0.3s ease;
        `;

        const circularInner = document.createElement('div');
        circularInner.style.cssText = `
            width: 64px;
            height: 64px;
            border-radius: 50%;
            background: var(--b3-theme-background);
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
            z-index: 1;
        `;

        // 控制按钮容器（在圆环中心）
        const controlsInCircle = document.createElement('div');
        controlsInCircle.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
        `;

        this.startPauseBtn = document.createElement('button');
        this.startPauseBtn.className = 'circle-control-btn';
        this.startPauseBtn.style.cssText = `
            background: none;
            border: none;
            cursor: pointer;
            font-size: 18px;
            color: var(--b3-theme-on-surface);
            padding: 4px;
            border-radius: 4px;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
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
            padding: 4px;
            border-radius: 4px;
            transition: all 0.2s;
            display: none;
            align-items: center;
            justify-content: center;
        `;
        this.stopBtn.innerHTML = '⏹';
        this.stopBtn.addEventListener('click', () => this.resetTimer());

        controlsInCircle.appendChild(this.startPauseBtn);
        controlsInCircle.appendChild(this.stopBtn);
        circularInner.appendChild(controlsInCircle);
        this.circularProgress.appendChild(circularInner);
        circularContainer.appendChild(this.circularProgress);

        progressContainer.appendChild(timeInfo);
        progressContainer.appendChild(circularContainer);

        // 统计信息容器
        this.statsContainer = document.createElement('div');
        this.statsContainer.className = 'pomodoro-stats';
        this.statsContainer.style.cssText = `
            display: ${this.isExpanded ? 'flex' : 'none'};
            justify-content: space-between;
            padding: 16px;
            background: var(--b3-theme-surface);
            border-radius: 8px;
            margin-top: 16px;
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

        content.appendChild(progressContainer);
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
            e.preventDefault();
            isDragging = true;

            const rect = this.container.getBoundingClientRect();
            initialX = e.clientX - rect.left;
            initialY = e.clientY - rect.top;

            document.addEventListener('mousemove', drag);
            document.addEventListener('mouseup', stopDrag);
        });

        const drag = (e) => {
            if (!isDragging) return;

            e.preventDefault();
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;

            // 限制在窗口范围内
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

        // 更新统计显示
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
        const minutes = Math.floor(this.timeLeft / 60);
        const seconds = this.timeLeft % 60;
        this.timeDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

        // 更新圆环进度
        const progress = ((this.totalTime - this.timeLeft) / this.totalTime);
        const degrees = progress * 360;
        const color = this.isWorkPhase ? '#FF6B6B' : '#4CAF50';

        this.circularProgress.style.background = `conic-gradient(${color} ${degrees}deg, var(--b3-theme-surface-variant) ${degrees}deg)`;

        // 更新按钮状态
        if (!this.isRunning) {
            this.startPauseBtn.innerHTML = '▶️';
            this.startPauseBtn.style.display = 'flex';
            this.stopBtn.style.display = 'none';
        } else if (this.isPaused) {
            this.startPauseBtn.innerHTML = '▶️';
            this.startPauseBtn.style.display = 'flex';
            this.stopBtn.style.display = 'flex';
        } else {
            this.startPauseBtn.innerHTML = '⏸';
            this.startPauseBtn.style.display = 'flex';
            this.stopBtn.style.display = 'none';
        }
    }

    private toggleTimer() {
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

    private startTimer() {
        this.isRunning = true;
        this.isPaused = false;
        this.startPauseBtn.textContent = '暂停';

        // 播放工作背景音
        if (this.isWorkPhase && this.workAudio) {
            this.workAudio.play().catch(e => console.warn('无法播放工作背景音:', e));
        }

        this.timer = window.setInterval(() => {
            this.timeLeft--;
            this.updateDisplay();

            if (this.timeLeft <= 0) {
                this.completePhase();
            }
        }, 1000);

        showMessage(`番茄钟已开始：${this.isWorkPhase ? '工作时间' : '休息时间'}`);
    }

    private pauseTimer() {
        this.isPaused = true;
        this.startPauseBtn.textContent = '继续';

        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }

        // 暂停背景音
        if (this.workAudio) {
            this.workAudio.pause();
        }
    }

    private resumeTimer() {
        this.isPaused = false;
        this.startPauseBtn.textContent = '暂停';

        // 恢复背景音
        if (this.isWorkPhase && this.workAudio) {
            this.workAudio.play().catch(e => console.warn('无法播放工作背景音:', e));
        }

        this.timer = window.setInterval(() => {
            this.timeLeft--;
            this.updateDisplay();

            if (this.timeLeft <= 0) {
                this.completePhase();
            }
        }, 1000);
    }

    private resetTimer() {
        this.isRunning = false;
        this.isPaused = false;
        this.isWorkPhase = true;
        this.startPauseBtn.textContent = '开始';
        this.statusDisplay.textContent = '工作时间';

        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }

        // 停止所有音频
        if (this.workAudio) {
            this.workAudio.pause();
            this.workAudio.currentTime = 0;
        }

        this.timeLeft = this.settings.workDuration * 60;
        this.totalTime = this.timeLeft;
        this.updateDisplay();
    }

    private async completePhase() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }

        // 停止工作背景音
        if (this.workAudio) {
            this.workAudio.pause();
            this.workAudio.currentTime = 0;
        }

        // 播放结束提示音
        if (this.endAudio) {
            this.endAudio.play().catch(e => console.warn('无法播放结束提示音:', e));
        }

        if (this.isWorkPhase) {
            // 记录完成的工作番茄
            await this.recordManager.recordWorkSession(this.settings.workDuration);

            showMessage('🍅 工作时间结束！开始休息吧～', 3000);
            this.isWorkPhase = false;
            this.statusDisplay.textContent = '休息时间';
            this.timeLeft = this.settings.breakDuration * 60;
        } else {
            // 记录完成的休息时间
            await this.recordManager.recordBreakSession(this.settings.breakDuration);

            showMessage('☕ 休息结束！准备开始下一个番茄钟', 3000);
            this.isWorkPhase = true;
            this.statusDisplay.textContent = '工作时间';
            this.timeLeft = this.settings.workDuration * 60;
        }

        this.totalTime = this.timeLeft;
        this.isRunning = false;
        this.isPaused = false;
        this.updateDisplay();
        this.updateStatsDisplay();
    }

    show() {
        this.container.style.display = 'block';
    }

    close() {
        if (this.timer) {
            clearInterval(this.timer);
        }

        // 停止所有音频
        if (this.workAudio) {
            this.workAudio.pause();
        }
        if (this.endAudio) {
            this.endAudio.pause();
        }

        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
    }
}
