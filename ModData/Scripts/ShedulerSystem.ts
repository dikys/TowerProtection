
// --- Scheduler System ---

/**
 * @description Интерфейс для объектов, которые могут быть добавлены в планировщик.
 * Любой класс, реализующий этот интерфейс, может быть обработан планировщиком.
 */
export interface ISchedulable {
    /**
     * @description Метод, который будет вызван планировщиком, когда наступит время события.
     * @param gameTickNum Текущий игровой тик, в который произошло событие.
     */
    OnScheduledEvent(gameTickNum: number): void;
}

/**
 * @description Внутренний класс для представления события в очереди планировщика.
 */
class ScheduledEvent {
    public readonly ExecutionTick: number;
    public readonly Target: ISchedulable;

    constructor(target: ISchedulable, executionTick: number) {
        this.Target = target;
        this.ExecutionTick = executionTick;
    }
}

/**
 * @description Класс планировщика, который управляет очередью отложенных событий.
 * Это позволяет избежать вызова OnEveryTick для всех объектов каждый тик,
 * значительно снижая нагрузку на процессор.
 */
export class Scheduler {
    private eventQueue: ScheduledEvent[] = [];

    // --- Динамический лимит для контроля FPS ---
    private executionLimit: number = 10; // Начальное значение
    private readonly minExecutionLimit: number = 4;   // Минимальный лимит
    private readonly maxExecutionLimit: number = 100;  // Максимальный лимит

    /**
     * @description Планирует выполнение события для объекта в указанный тик.
     * @param target Объект, для которого нужно выполнить событие.
     * @param executionTick Тик, в который нужно выполнить событие.
     */
    public Schedule(target: ISchedulable, executionTick: number) {
        const event = new ScheduledEvent(target, executionTick);

        // Вставка с сохранением сортировки (бинарный поиск)
        let low = 0;
        let high = this.eventQueue.length;
        while (low < high) {
            const mid = (low + high) >>> 1;
            if (this.eventQueue[mid].ExecutionTick < executionTick) {
                low = mid + 1;
            } else {
                high = mid;
            }
        }
        this.eventQueue.splice(low, 0, event);
    }

    /**
     * @description Выполняет все события, время которых пришло, но не более чем executionLimit за один вызов.
     * @param gameTickNum Текущий игровой тик.
     */
    public Execute(gameTickNum: number) {
        let executedCount = 0;
        while (executedCount < this.executionLimit && this.eventQueue.length > 0 && this.eventQueue[0].ExecutionTick <= gameTickNum) {
            const event = this.eventQueue.shift();
            if (event) {
                // Если объект был помечен на удаление, не вызываем на нем событие
                if (!(event.Target as any).needDeleted) {
                    event.Target.OnScheduledEvent(gameTickNum);
                }
                executedCount++;
            }
        }
    }

    /**
     * @description Корректирует лимит выполняемых за тик событий на основе текущего FPS.
     * @param currentFPS Текущий FPS в игре.
     */
    public AdjustLimit(currentFPS: number) : number {
        if (currentFPS < 44) {
            // Уменьшаем лимит на 10%, но не ниже минимального
            this.executionLimit = Math.max(this.minExecutionLimit, Math.floor(this.executionLimit * 0.9));
        } else if (currentFPS > 48) {
            // Увеличиваем лимит на 10%, но не выше максимального
            this.executionLimit = Math.min(this.maxExecutionLimit, Math.ceil(this.executionLimit * 1.1));
        }
        return this.executionLimit;
    }
}

// --- Enums and Constants ---
