import { Calendar } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { showMessage, confirm, openTab, Menu } from "siyuan";
import { readReminderData, writeReminderData, getBlockByID } from "../api";
import { getLocalDateTime } from "../utils/dateUtils";

export class CalendarView {
    private container: HTMLElement;
    private calendar: Calendar;
    private plugin: any;

    constructor(container: HTMLElement, plugin: any) {
        this.container = container;
        this.plugin = plugin;
        this.initUI();
    }

    private async initUI() {
        this.container.classList.add('reminder-calendar-view');

        // 创建工具栏
        const toolbar = document.createElement('div');
        toolbar.className = 'reminder-calendar-toolbar';
        this.container.appendChild(toolbar);

        // 视图切换按钮
        const viewGroup = document.createElement('div');
        viewGroup.className = 'reminder-calendar-view-group';
        toolbar.appendChild(viewGroup);

        const monthBtn = document.createElement('button');
        monthBtn.className = 'b3-button b3-button--outline';
        monthBtn.textContent = '月';
        monthBtn.addEventListener('click', () => this.calendar.changeView('dayGridMonth'));
        viewGroup.appendChild(monthBtn);

        const weekBtn = document.createElement('button');
        weekBtn.className = 'b3-button b3-button--outline';
        weekBtn.textContent = '周';
        weekBtn.addEventListener('click', () => this.calendar.changeView('timeGridWeek'));
        viewGroup.appendChild(weekBtn);

        const dayBtn = document.createElement('button');
        dayBtn.className = 'b3-button b3-button--outline';
        dayBtn.textContent = '日';
        dayBtn.addEventListener('click', () => this.calendar.changeView('timeGridDay'));
        viewGroup.appendChild(dayBtn);

        // 创建日历容器
        const calendarEl = document.createElement('div');
        calendarEl.className = 'reminder-calendar-container';
        this.container.appendChild(calendarEl);

        // 初始化日历
        this.calendar = new Calendar(calendarEl, {
            plugins: [dayGridPlugin, timeGridPlugin, interactionPlugin],
            initialView: 'dayGridMonth',
            headerToolbar: {
                left: 'prev,next today',
                center: 'title',
                right: '' // 我们使用自定义按钮来切换视图
            },
            editable: true, // 允许拖动事件
            selectable: true,
            locale: 'zh-cn',
            eventClassNames: 'reminder-calendar-event',
            eventContent: this.renderEventContent.bind(this),
            eventClick: this.handleEventClick.bind(this),
            eventDrop: this.handleEventDrop.bind(this),
            eventResize: this.handleEventResize.bind(this),
            dateClick: this.handleDateClick.bind(this),
            events: await this.getEvents(),
            // 添加右键菜单支持
            eventDidMount: (info) => {
                info.el.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    this.showEventContextMenu(e, info.event);
                });
            }
        });

        this.calendar.render();

        // 监听提醒更新事件
        window.addEventListener('reminderUpdated', this.refreshEvents.bind(this));
    }

    private showEventContextMenu(event: MouseEvent, calendarEvent: any) {
        const menu = new Menu("calendarEventContextMenu");

        menu.addItem({
            iconHTML: "📖",
            label: "打开笔记",
            click: () => {
                this.handleEventClick({ event: calendarEvent });
            }
        });

        menu.addItem({
            iconHTML: "✅",
            label: calendarEvent.extendedProps.completed ? "标记为未完成" : "标记为已完成",
            click: () => {
                this.toggleEventCompleted(calendarEvent);
            }
        });

        menu.addSeparator();

        menu.addItem({
            iconHTML: "🗑️",
            label: "删除提醒",
            click: () => {
                this.deleteEvent(calendarEvent);
            }
        });

        menu.open({
            x: event.clientX,
            y: event.clientY
        });
    }

    private async deleteEvent(calendarEvent: any) {
        const reminder = calendarEvent.extendedProps;
        const result = await confirm(
            "删除提醒",
            `确定要删除提醒"${calendarEvent.title}"吗？此操作无法撤销。`,
            () => {
                this.performDeleteEvent(calendarEvent.id);
            }
        );
    }

    private async performDeleteEvent(reminderId: string) {
        try {
            const reminderData = await readReminderData();

            if (reminderData[reminderId]) {
                delete reminderData[reminderId];
                await writeReminderData(reminderData);

                window.dispatchEvent(new CustomEvent('reminderUpdated'));
                await this.refreshEvents();

                showMessage('提醒已删除');
            } else {
                showMessage('提醒不存在');
            }
        } catch (error) {
            console.error('删除提醒失败:', error);
            showMessage('删除提醒失败，请重试');
        }
    }

    private renderEventContent(eventInfo) {
        const wrapper = document.createElement('div');
        wrapper.className = 'reminder-calendar-event-wrapper';

        // 添加复选框
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'reminder-calendar-event-checkbox';
        checkbox.checked = eventInfo.event.extendedProps.completed || false;
        checkbox.addEventListener('click', (e) => {
            e.stopPropagation(); // 阻止事件冒泡
            this.toggleEventCompleted(eventInfo.event);
        });

        // 添加事件内容
        const eventEl = document.createElement('div');
        eventEl.className = 'reminder-calendar-event-content';
        if (eventInfo.event.extendedProps.completed) {
            eventEl.classList.add('completed');
        }
        eventEl.innerHTML = `<div class="fc-event-title">${eventInfo.event.title}</div>`;

        if (eventInfo.event.extendedProps.note) {
            const noteEl = document.createElement('div');
            noteEl.className = 'reminder-calendar-event-note';
            noteEl.textContent = eventInfo.event.extendedProps.note;
            eventEl.appendChild(noteEl);
        }

        wrapper.appendChild(checkbox);
        wrapper.appendChild(eventEl);

        return { domNodes: [wrapper] };
    }

    private async toggleEventCompleted(event) {
        try {
            const reminderId = event.id;
            const reminderData = await readReminderData();

            if (reminderData[reminderId]) {
                reminderData[reminderId].completed = !reminderData[reminderId].completed;
                await writeReminderData(reminderData);

                event.setExtendedProp('completed', reminderData[reminderId].completed);
                window.dispatchEvent(new CustomEvent('reminderUpdated'));
            }
        } catch (error) {
            console.error('切换事件完成状态失败:', error);
            showMessage('切换完成状态失败，请重试');
        }
    }

    private async handleEventClick(info) {
        const reminder = info.event.extendedProps;
        const blockId = reminder.blockId || info.event.id; // 兼容旧数据格式

        try {
            // 检测块是否存在
            const block = await getBlockByID(blockId);
            if (!block) {
                throw new Error('块不存在');
            }

            window.open(`siyuan://blocks/${blockId}`, '_self');
        } catch (error) {
            console.error('打开笔记失败:', error);

            // 询问用户是否删除无效的提醒
            const result = await confirm(
                "打开笔记失败",
                "该笔记块可能已被删除，是否删除相关的提醒？",
                async () => {
                    // 删除当前提醒
                    await this.performDeleteEvent(info.event.id);
                },
                () => {
                    showMessage('打开笔记失败，该块可能已被删除');
                }
            );
        }
    }

    private async handleEventDrop(info) {
        const reminderId = info.event.id;
        const originalReminder = info.event.extendedProps;

        try {
            const reminderData = await readReminderData();

            if (reminderData[reminderId]) {
                const newStartDate = info.event.start;
                const newEndDate = info.event.end;

                if (originalReminder.endDate) {
                    if (newEndDate) {
                        const { dateStr: startDateStr } = getLocalDateTime(newStartDate);
                        const endDate = new Date(newEndDate);
                        endDate.setDate(endDate.getDate() - 1);
                        const endDateStr = endDate.toISOString().split('T')[0];

                        reminderData[reminderId].date = startDateStr;

                        if (endDateStr !== startDateStr) {
                            reminderData[reminderId].endDate = endDateStr;
                        } else {
                            delete reminderData[reminderId].endDate;
                        }
                    } else {
                        const { dateStr: startDateStr, timeStr } = getLocalDateTime(newStartDate);
                        reminderData[reminderId].date = startDateStr;
                        delete reminderData[reminderId].endDate;

                        if (!info.event.allDay && timeStr) {
                            reminderData[reminderId].time = timeStr;
                        }
                    }
                } else {
                    if (newEndDate && info.event.allDay) {
                        const { dateStr: startDateStr } = getLocalDateTime(newStartDate);
                        const endDate = new Date(newEndDate);
                        endDate.setDate(endDate.getDate() - 1);
                        const endDateStr = endDate.toISOString().split('T')[0];

                        reminderData[reminderId].date = startDateStr;

                        if (endDateStr !== startDateStr) {
                            reminderData[reminderId].endDate = endDateStr;
                            delete reminderData[reminderId].time;
                        }
                    } else {
                        const { dateStr: startDateStr, timeStr } = getLocalDateTime(newStartDate);
                        reminderData[reminderId].date = startDateStr;

                        if (!info.event.allDay && timeStr) {
                            reminderData[reminderId].time = timeStr;
                        } else if (info.event.allDay) {
                            delete reminderData[reminderId].time;
                        }
                    }
                }

                await writeReminderData(reminderData);
                showMessage('已更新事件时间');
                await this.refreshEvents();
            } else {
                throw new Error('提醒数据不存在');
            }
        } catch (error) {
            console.error('更新事件时间失败:', error);
            showMessage('更新事件时间失败，请重试');
            info.revert();
        }
    }

    private async handleEventResize(info) {
        const reminderId = info.event.id;
        const originalReminder = info.event.extendedProps;

        try {
            const reminderData = await readReminderData();

            if (reminderData[reminderId]) {
                const newStartDate = info.event.start;
                const newEndDate = info.event.end;

                if (newEndDate) {
                    if (info.event.allDay) {
                        // 全天事件：FullCalendar 的结束日期是排他的，需要减去一天
                        const { dateStr: startDateStr } = getLocalDateTime(newStartDate);
                        const { dateStr: endDateStr } = getLocalDateTime(new Date(newEndDate.getTime() - 24 * 60 * 60 * 1000));

                        reminderData[reminderId].date = startDateStr;

                        if (endDateStr !== startDateStr) {
                            reminderData[reminderId].endDate = endDateStr;
                            // 全天事件删除时间信息
                            delete reminderData[reminderId].time;
                            delete reminderData[reminderId].endTime;
                        } else {
                            delete reminderData[reminderId].endDate;
                            delete reminderData[reminderId].endTime;
                        }
                    } else {
                        // 定时事件：处理开始和结束时间
                        const { dateStr: startDateStr, timeStr: startTimeStr } = getLocalDateTime(newStartDate);
                        const { dateStr: endDateStr, timeStr: endTimeStr } = getLocalDateTime(newEndDate);

                        reminderData[reminderId].date = startDateStr;

                        if (startTimeStr) {
                            reminderData[reminderId].time = startTimeStr;
                        }

                        // 保存结束时间信息
                        if (endDateStr !== startDateStr) {
                            // 跨天的定时事件
                            reminderData[reminderId].endDate = endDateStr;
                            if (endTimeStr) {
                                reminderData[reminderId].endTime = endTimeStr;
                            }
                        } else {
                            // 同一天的定时事件
                            delete reminderData[reminderId].endDate;
                            if (endTimeStr) {
                                reminderData[reminderId].endTime = endTimeStr;
                            }
                        }
                    }
                } else {
                    // 没有结束日期的情况
                    const { dateStr: startDateStr, timeStr } = getLocalDateTime(newStartDate);
                    reminderData[reminderId].date = startDateStr;
                    delete reminderData[reminderId].endDate;
                    delete reminderData[reminderId].endTime;

                    if (!info.event.allDay && timeStr) {
                        reminderData[reminderId].time = timeStr;
                    } else if (info.event.allDay) {
                        delete reminderData[reminderId].time;
                    }
                }

                await writeReminderData(reminderData);
                showMessage('已更新事件时间');
                await this.refreshEvents();
            } else {
                throw new Error('提醒数据不存在');
            }
        } catch (error) {
            console.error('调整事件大小失败:', error);
            showMessage('调整事件大小失败，请重试');
            info.revert();
        }
    }

    private handleDateClick(info) {
        // 点击日期，可以添加新的提醒
        const date = info.dateStr;
        // 这里可以打开创建提醒对话框，但需要选择一个块ID
        showMessage('请先在文档中选择一个块，然后为其创建提醒');
    }

    private async getEvents() {
        try {
            const reminderData = await readReminderData();
            const events = [];

            Object.values(reminderData).forEach((reminder: any) => {
                if (!reminder || typeof reminder !== 'object') return;

                let eventObj: any = {
                    id: reminder.id,
                    title: reminder.title || '未命名笔记',
                    backgroundColor: reminder.completed ? '#e3e3e3' : undefined,
                    borderColor: reminder.completed ? '#e3e3e3' : undefined,
                    textColor: reminder.completed ? '#999999' : undefined,
                    extendedProps: {
                        completed: reminder.completed || false,
                        note: reminder.note || '',
                        date: reminder.date,
                        endDate: reminder.endDate || null,
                        time: reminder.time || null,
                        endTime: reminder.endTime || null,
                        blockId: reminder.blockId || reminder.id // 兼容旧数据格式
                    }
                };

                // 处理跨天事件
                if (reminder.endDate) {
                    // 跨天事件
                    if (reminder.time && reminder.endTime) {
                        // 跨天定时事件
                        eventObj.start = `${reminder.date}T${reminder.time}:00`;
                        eventObj.end = `${reminder.endDate}T${reminder.endTime}:00`;
                        eventObj.allDay = false;
                    } else {
                        // 跨天全天事件
                        eventObj.start = reminder.date;
                        // FullCalendar 需要结束日期为下一天才能正确显示跨天事件
                        const endDate = new Date(reminder.endDate);
                        endDate.setDate(endDate.getDate() + 1);
                        eventObj.end = endDate.toISOString().split('T')[0];
                        eventObj.allDay = true;

                        // 如果有时间信息，在标题中显示
                        if (reminder.time) {
                            eventObj.title = `${reminder.title || '未命名笔记'} (${reminder.time})`;
                        }
                    }
                } else {
                    // 单日事件
                    if (reminder.time) {
                        eventObj.start = `${reminder.date}T${reminder.time}:00`;
                        // 如果有结束时间，设置结束时间
                        if (reminder.endTime) {
                            eventObj.end = `${reminder.date}T${reminder.endTime}:00`;
                        }
                        eventObj.allDay = false;
                    } else {
                        eventObj.start = reminder.date;
                        eventObj.allDay = true;
                        eventObj.display = 'block';
                    }
                }

                events.push(eventObj);
            });

            return events;
        } catch (error) {
            console.error('获取事件数据失败:', error);
            showMessage('加载提醒数据失败');
            return [];
        }
    }

    private async refreshEvents() {
        try {
            const events = await this.getEvents();

            // 清除所有现有事件
            this.calendar.removeAllEvents();

            // 添加新事件
            this.calendar.addEventSource(events);

            // 强制重新渲染日历
            this.calendar.render();
        } catch (error) {
            console.error('刷新事件失败:', error);
        }
    }
}
