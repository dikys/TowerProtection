import { GlobalVars } from "../GlobalData";
import { ISchedulable } from "../ShedulerSystem";
import { CreateUnitConfig } from "../Utils";
import { UnitFlags } from "library/game-logic/horde-types";

export class IBuff implements ISchedulable {
    static CfgUid      : string = "";
    static BaseCfgUid  : string = "";
    
    /** максимальное количество баффов на башню */
    static MaxCount    : number = -1;

    /** номер команды к которому принадлежит бафф */
    teamNum: number;
    /** тик на котором нужно обрабатывать юнита */
    processingTick: number;
    /** модуль на который делится игровой тик, если остаток деления равен processingTick, то юнит обрабатывается */
    processingTickModule: number;
    
    private static _ProcessingTickIterator : number = 0;

    /** флаг, что юнита нужно удалить из списка юнитов, чтобы отключить обработку */
    needDeleted: boolean;

    /** @description Флаг, указывающий, что бафф использует новую систему планировщика и его не нужно обрабатывать в старом цикле. */
    usesScheduler: boolean;

    constructor (teamNum: number, deleteFlag: boolean = false) {
        this.teamNum              = teamNum;
        this.processingTickModule = 50;
        this.processingTick       = IBuff._ProcessingTickIterator++ % this.processingTickModule;
        this.needDeleted          = deleteFlag;
        this.usesScheduler        = false; // По умолчанию все баффы используют старую систему
    }

    public static InitConfig() {
        if (this.BaseCfgUid != "" && this.CfgUid != "") {
            GlobalVars.configs[this.CfgUid] = CreateUnitConfig(this.BaseCfgUid, this.CfgUid);

            // зануляем стоимость
            ScriptUtils.SetValue(GlobalVars.configs[this.CfgUid].CostResources, "Gold",   0);
            ScriptUtils.SetValue(GlobalVars.configs[this.CfgUid].CostResources, "Metal",  0);
            ScriptUtils.SetValue(GlobalVars.configs[this.CfgUid].CostResources, "Lumber", 0);
            ScriptUtils.SetValue(GlobalVars.configs[this.CfgUid].CostResources, "People", 0);
            // время постройки
            ScriptUtils.SetValue(GlobalVars.configs[this.CfgUid], "ProductionTime", 10);
            ScriptUtils.SetValue(GlobalVars.configs[this.CfgUid], "MaxHealth", 1);
            // убираем требования
            GlobalVars.configs[this.CfgUid].TechConfig.Requirements.Clear();
            // убираем флаги здания
            ScriptUtils.SetValue(GlobalVars.configs[this.CfgUid], "Flags", UnitFlags.FireResistant);
            // делаем размер 1 х 1
            ScriptUtils.SetValue(GlobalVars.configs[this.CfgUid].Size, "Width", 1);
            ScriptUtils.SetValue(GlobalVars.configs[this.CfgUid].Size, "Height", 1);
        }
    }

    public OnEveryTick(gameTickNum: number) {}

    public OnDead(gameTickNum: number) {}

    /**
     * @description Метод, который будет вызван планировщиком. 
     * Логика периодических действий для баффов, использующих планировщик, должна быть здесь.
     */
    public OnScheduledEvent(gameTickNum: number) {}
};
