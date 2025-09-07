import { createPoint } from "library/common/primitives";
import { PointCommandArgs, ProduceAtCommandArgs, Unit } from "library/game-logic/horde-types";
import { GlobalVars } from "../GlobalData";
import { CreateUnitConfig } from "../Utils";
import { Cell } from "./Geometry";
import { ISchedulable } from "../ShedulerSystem";

export class IUnit implements ISchedulable {
    /** ссылка на юнита */
    unit: Unit;
    /** ссылка на отдел приказов юнита */
    unit_ordersMind: HordeClassLibrary.UnitComponents.Minds.OrdersMind;
    /** номер команды к которому принадлежит юнит */
    teamNum: number;
    
    /** @description Частота обработки логики юнита в тиках. */
    public processingRate: number;

    /** флаг, что юнита нужно удалить из списка юнитов, чтобы отключить обработку */
    needDeleted: boolean;

    /** @description Флаг, указывающий, что юнит использует новую систему планировщика. */
    usesScheduler: boolean;

    static CfgUid      : string = "";
    static BaseCfgUid  : string = "";

    constructor (unit: Unit, teamNum: number) {
        this.unit                   = unit;
        this.teamNum                = teamNum;
        this.unit_ordersMind        = this.unit.OrdersMind;
        this.needDeleted            = false;
        this.usesScheduler          = true; // Все юниты теперь по умолчанию используют планировщик
        this.processingRate         = 50;   // По умолчанию юнит обрабатывается раз в секунду

        // Планируем первую обработку со смещением, чтобы распределить нагрузку
        const initialOffset = this.unit.PseudoTickCounter % this.processingRate;
        GlobalVars.scheduler.Schedule(this, GlobalVars.gameTickNum + initialOffset);
    }

    public static InitConfig() {
        if (this.BaseCfgUid != "" && this.CfgUid != "") {
            GlobalVars.configs[this.CfgUid] = CreateUnitConfig(this.BaseCfgUid, this.CfgUid);
        }
    }

    /**
     * @description Основная логика юнита, вызываемая планировщиком.
     * Наследники должны переопределять этот метод.
     * В конце метода необходимо запланировать следующий вызов.
     */
    public OnScheduledEvent(gameTickNum: number) {
        // Базовая реализация планирует следующий вызов.
        // Наследники должны вызывать super.OnScheduledEvent(gameTickNum) или планировать вызов самостоятельно.
        if (!this.needDeleted) {
            GlobalVars.scheduler.Schedule(this, gameTickNum + this.processingRate);

            // обрабатываем смерть
            if (this.unit.IsDead) {
                this.needDeleted = true;
                this.OnDead(gameTickNum);
            }
        }
    }

    public OnDead(gameTickNum: number) {}
    
    /** отдать приказ в точку */
    public GivePointCommand(cell: Cell, command: any, orderMode: any) {
        var pointCommandArgs = new PointCommandArgs(createPoint(cell.X, cell.Y), command, orderMode);
        this.unit.Cfg.GetOrderDelegate(this.unit, pointCommandArgs);
    }
    /** отдать приказ о постройке в точке */
    public GivePointProduceCommand(cfg: any, cell: Cell, orderMode: any) {
        var produceAtCommandArgs = new ProduceAtCommandArgs(
            orderMode,
            cfg,
            createPoint(cell.X, cell.Y));
        this.unit.Cfg.GetOrderDelegate(this.unit, produceAtCommandArgs);
    }
}

export function RandomElement<T>(array: Array<T>) : T {
    return array[GlobalVars.rnd.RandomNumber(0, array.length - 1)];
}