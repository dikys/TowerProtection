import { UnitProfession, UnitProducerProfessionParams } from "library/game-logic/unit-professions";
import { IUnit } from "../Types/IUnit";
import { CfgAddUnitProducer, ChebyshevDistance, CreateUnitConfig, setUnitStateWorker } from "../Utils";
import { AttackPlansClass } from "./AttackPlans";
import { CFGPrefix, GlobalVars, ReplaceUnitParameters } from "../GlobalData";
import { UnitCommand, UnitState } from "library/game-logic/horde-types";
import { iterateOverUnitsInBox } from "library/game-logic/unit-and-map";
import { IProducerUnit } from "../Types/IProducerUnit";

export class Player_TOWER_BASE extends IProducerUnit {
    static CfgUid      : string = "#" + CFGPrefix + "_Goal_Tower";
    static BaseCfgUid  : string = "#UnitConfig_Slavyane_Tower";

    private _armamentsMaxDistance   : number;
    private _armamentsTargetEndNum  : Array<number>;
    private _armamentsTargetNextNum : Array<number>;
    private _targetsUnitInfo        : Array<any>;

    constructor (unit: any, teamNum: number) {
        super(unit, teamNum);

        this._armamentsMaxDistance   = 0;
        this._armamentsTargetEndNum  = new Array<number>();
        this._armamentsTargetNextNum = new Array<number>();
        this._targetsUnitInfo        = new Array<any>();

        this.processingTickModule   = 150;
        this.processingTick         = this.unit.PseudoTickCounter % this.processingTickModule;

        // Определяем максимальную дальность атаки
        if (this.unit.Cfg.MainArmament) {
            this._armamentsMaxDistance = this.unit.Cfg.MainArmament.Range;
        }
        if (this.unit.Cfg.SecondaryArmament) {
            this._armamentsMaxDistance = Math.max(this._armamentsMaxDistance, this.unit.Cfg.SecondaryArmament.Range);
        }
    }

    public static InitConfig() {
        IProducerUnit.InitConfig.call(this);

        // ХП
        ScriptUtils.SetValue(GlobalVars.configs[this.CfgUid], "MaxHealth", 3000);
        // мин ХП
        ScriptUtils.SetValue(GlobalVars.configs[this.CfgUid], "MinHealth", 0);
        // Броня
        ScriptUtils.SetValue(GlobalVars.configs[this.CfgUid], "Shield", 0);
        // убираем захват
        if (GlobalVars.configs[this.CfgUid].ProfessionParams.ContainsKey(UnitProfession.Capturable)) {
            GlobalVars.configs[this.CfgUid].ProfessionParams.Remove(UnitProfession.Capturable);
        }
        // убираем починку
        //if (GlobalVars.configs[this.CfgUid].ProfessionParams.ContainsKey(UnitProfession.Reparable)) {
        //   GlobalVars.configs[this.CfgUid].ProfessionParams.Remove(UnitProfession.Reparable);
        //}
        // обнуляем флаги
        ScriptUtils.SetValue(GlobalVars.configs[this.CfgUid], "Flags", HordeContentApi.GetUnitConfig("#UnitConfig_Slavyane_Tower").Flags);
        // запрещаем самоуничтожение
        GlobalVars.configs[this.CfgUid].AllowedCommands.Remove(UnitCommand.DestroySelf);
        // запрещаем атаку
        GlobalVars.configs[this.CfgUid].AllowedCommands.Remove(UnitCommand.Attack);

        // видимость и дальность атаки делаем = 13
        ScriptUtils.SetValue(GlobalVars.configs[this.CfgUid], "Sight", 21);
        ScriptUtils.SetValue(GlobalVars.configs[this.CfgUid], "OrderDistance", 13);
        ScriptUtils.SetValue(GlobalVars.configs[this.CfgUid].MainArmament, "Range", 13);
    }

    public Respawn() {
        let replaceParams                 = new ReplaceUnitParameters();
        replaceParams.OldUnit             = this.unit;
        replaceParams.NewUnitConfig       = GlobalVars.configs[this.unit.Cfg.Uid];
        replaceParams.Cell                = null;  // Можно задать клетку, в которой должен появиться новый юнит. Если null, то центр создаваемого юнита совпадет с предыдущим
        replaceParams.PreserveHealthLevel = true; // Нужно ли передать уровень здоровья? (в процентном соотношении)
        replaceParams.PreserveOrders      = false; // Нужно ли передать приказы?
        replaceParams.Silent              = true;  // Отключение вывода в лог возможных ошибок (при регистрации и создании модели)
        var kills                         = this.unit.KillsCounter;
        this.unit                         = this.unit.Owner.Units.ReplaceUnit(replaceParams);
        this.unit.KillsCounter            = kills;
    }

    public GetTargetUnit(armamentDistance: number): any {
        if (armamentDistance >= this._armamentsMaxDistance || this._targetsUnitInfo.length === 0 || this._armamentsTargetEndNum[armamentDistance] === 0) {
            return null;
        }

        const targetIndex = this._armamentsTargetNextNum[armamentDistance];
        const targetUnit = this._targetsUnitInfo[targetIndex].unit;

        this._armamentsTargetNextNum[armamentDistance]--;
        if (this._armamentsTargetNextNum[armamentDistance] < 0) {
            this._armamentsTargetNextNum[armamentDistance] = this._armamentsTargetEndNum[armamentDistance] - 1;
        }

        return targetUnit;
    }

    public OnEveryTick(gameTickNum: number): void {
        // модуль нужен, чтобы не каждый тик выполнять дорогостоящие операции
        if (gameTickNum % this.processingTickModule !== this.processingTick) {
            return;
        }

        if (this._armamentsMaxDistance === 0) {
            return;
        }

        // Ищем ближайшие цели
        this._targetsUnitInfo = [];
        const unitsIter = iterateOverUnitsInBox(this.unit.Cell, this._armamentsMaxDistance);
        for (let u = unitsIter.next(); !u.done; u = unitsIter.next()) {
            const _unit = u.value;

            if (_unit.IsDead || _unit.Id === this.unit.Id || Number.parseInt(_unit.Owner.Uid) === GlobalVars.teams[this.teamNum].settlementIdx) {
                continue;
            }

            // +0.5, +0.5 это чтобы центр башни
            // итоговое расстояние уменьшаем на 1, чтобы расстояние от края башни считалось
            const distance = ChebyshevDistance(_unit.Cell.X, _unit.Cell.Y, this.unit.Cell.X + 0.5, this.unit.Cell.Y + 0.5) - 1;
            this._targetsUnitInfo.push({ unit: _unit, distance: distance });
        }

        // Сортируем цели по расстоянию
        this._targetsUnitInfo.sort((a, b) => a.distance - b.distance);

        // Инициализируем массивы для выбора целей
        this._armamentsTargetEndNum = new Array<number>(this._armamentsMaxDistance).fill(this._targetsUnitInfo.length);
        this._armamentsTargetNextNum = new Array<number>(this._armamentsMaxDistance).fill(this._targetsUnitInfo.length > 0 ? this._targetsUnitInfo.length - 1 : 0);

        if (this._targetsUnitInfo.length > 0) {
            let armamentDistance = 0;
            for (let targetNum = 0; targetNum < this._targetsUnitInfo.length; targetNum++) {
                const targetDistance = this._targetsUnitInfo[targetNum].distance;
                for (; armamentDistance < targetDistance && armamentDistance < this._armamentsMaxDistance; armamentDistance++) {
                    this._armamentsTargetEndNum[armamentDistance] = targetNum;
                    this._armamentsTargetNextNum[armamentDistance] = targetNum > 0 ? targetNum - 1 : 0;
                }
            }
        }
    }
}

export class Player_TOWER_0 extends Player_TOWER_BASE {
    static CfgUid      : string = Player_TOWER_BASE.CfgUid + "_0";

    constructor (unit: any, teamNum: number) {
        super(unit, teamNum);
    }
}

export class Player_TOWER_1 extends Player_TOWER_BASE {
    static CfgUid      : string = Player_TOWER_BASE.CfgUid + "_1";

    constructor (unit: any, teamNum: number) {
        super(unit, teamNum);
    }
}

export class Player_TOWER_2 extends Player_TOWER_BASE {
    static CfgUid      : string = Player_TOWER_BASE.CfgUid + "_2";

    constructor (unit: any, teamNum: number) {
        super(unit, teamNum);
    }
}

export class Player_TOWER_3 extends Player_TOWER_BASE {
    static CfgUid      : string = Player_TOWER_BASE.CfgUid + "_3";

    constructor (unit: any, teamNum: number) {
        super(unit, teamNum);
    }
}

export class Player_TOWER_4 extends Player_TOWER_BASE {
    static CfgUid      : string = Player_TOWER_BASE.CfgUid + "_4";

    constructor (unit: any, teamNum: number) {
        super(unit, teamNum);
    }
}

export class Player_TOWER_5 extends Player_TOWER_BASE {
    static CfgUid      : string = Player_TOWER_BASE.CfgUid + "_5";

    constructor (unit: any, teamNum: number) {
        super(unit, teamNum);
    }
}

export class Player_TOWER_CHOISE_DIFFICULT extends IUnit {
    static CfgUid      : string = "#" + CFGPrefix + "_Tower_CHOISE_DIFFICULT";
    static BaseCfgUid  : string = "#UnitConfig_Slavyane_Tower";

    constructor (unit: any, teamNum: number) {
        super(unit, teamNum);
    }

    public static InitConfig() {
        IUnit.InitConfig.call(this);

        // описание
        ScriptUtils.SetValue(GlobalVars.configs[this.CfgUid], "Name", "Выберите сложность");
        // ХП
        ScriptUtils.SetValue(GlobalVars.configs[this.CfgUid], "MaxHealth", 100000);
        // Броня
        ScriptUtils.SetValue(GlobalVars.configs[this.CfgUid], "Shield", 1000);
        // Урон
        ScriptUtils.SetValue(GlobalVars.configs[this.CfgUid].MainArmament.ShotParams, "Damage", 1000);
        // Перезарядка
        ScriptUtils.SetValue(GlobalVars.configs[this.CfgUid], "ReloadTime", 1);
        // убираем починку
        GlobalVars.configs[this.CfgUid].ProfessionParams.Remove(UnitProfession.Reparable);
        // запрещаем самоуничтожение
        GlobalVars.configs[this.CfgUid].AllowedCommands.Remove(UnitCommand.DestroySelf);
        // даем профессию найма
        CfgAddUnitProducer(GlobalVars.configs[this.CfgUid]);
        // добавляем постройку волн
        {
            var producerParams = GlobalVars.configs[this.CfgUid].GetProfessionParams(UnitProducerProfessionParams, UnitProfession.UnitProducer);
            var produceList    = producerParams.CanProduceList;
            produceList.Clear();

            var choise_BaseCfgUid = "#UnitConfig_Barbarian_Swordmen";
            var choise_CfgUid     = this.CfgUid + "_";
            for (var difficultIdx = 1; difficultIdx <= GlobalVars.difficult + 4; difficultIdx++) {
                var unitChoise_CfgUid = choise_CfgUid + difficultIdx;
                GlobalVars.configs[unitChoise_CfgUid] = CreateUnitConfig(choise_BaseCfgUid, unitChoise_CfgUid);

                // назначаем имя
                ScriptUtils.SetValue(GlobalVars.configs[unitChoise_CfgUid], "Name", "Выбрать сложность " + difficultIdx);
                // Броня
                ScriptUtils.SetValue(GlobalVars.configs[unitChoise_CfgUid], "Shield", difficultIdx);
                // описание
                if (difficultIdx < GlobalVars.difficult) {
                    ScriptUtils.SetValue(GlobalVars.configs[unitChoise_CfgUid], "Description", "Эта сложность меньше рекомендуемой");
                } else if (difficultIdx == GlobalVars.difficult) {
                    ScriptUtils.SetValue(GlobalVars.configs[unitChoise_CfgUid], "Description", "Рекомендуемая сложность");
                } else {
                    ScriptUtils.SetValue(GlobalVars.configs[unitChoise_CfgUid], "Description", "Эта сложность больше рекомендуемой");
                }
                // убираем цену
                ScriptUtils.SetValue(GlobalVars.configs[unitChoise_CfgUid].CostResources, "Gold",   0);
                ScriptUtils.SetValue(GlobalVars.configs[unitChoise_CfgUid].CostResources, "Metal",  0);
                ScriptUtils.SetValue(GlobalVars.configs[unitChoise_CfgUid].CostResources, "Lumber", 0);
                ScriptUtils.SetValue(GlobalVars.configs[unitChoise_CfgUid].CostResources, "People", 0);
                // убираем требования
                GlobalVars.configs[unitChoise_CfgUid].TechConfig.Requirements.Clear();

                produceList.Add(GlobalVars.configs[unitChoise_CfgUid]);
            }
        }
        // задаем кастомный обработчик постройки
        setUnitStateWorker(GlobalVars.plugin, GlobalVars.configs[this.CfgUid], UnitState.Produce, this.stateWorker_Produce);
    }

    private static stateWorker_Produce (u: any) {
        if(u.Owner.Resources.TakeResourcesIfEnough(u.OrdersMind.ActiveOrder.ProductUnitConfig.CostResources)) {
            u.ScriptData.TowerProtection_ProductUnitConfig = u.OrdersMind.ActiveOrder.ProductUnitConfig;
        }
        u.OrdersMind.CancelOrdersSafe(true);
    }
}

export class Player_TOWER_CHOISE_ATTACKPLAN extends IUnit {
    static CfgUid      : string = "#" + CFGPrefix + "_TOWER_CHOISE_ATTACKPLAN";
    static BaseCfgUid  : string = "#UnitConfig_Slavyane_Tower";

    constructor (unit: any, teamNum: number) {
        super(unit, teamNum);
    }

    public static InitConfig() {
        IUnit.InitConfig.call(this);

        // описание
        ScriptUtils.SetValue(GlobalVars.configs[this.CfgUid], "Name", "Выберите волну");
        // ХП
        ScriptUtils.SetValue(GlobalVars.configs[this.CfgUid], "MaxHealth", 2000);
        // Броня
        ScriptUtils.SetValue(GlobalVars.configs[this.CfgUid], "Shield", 1000);
        // убираем починку
        GlobalVars.configs[this.CfgUid].ProfessionParams.Remove(UnitProfession.Reparable);
        // запрещаем самоуничтожение
        GlobalVars.configs[this.CfgUid].AllowedCommands.Remove(UnitCommand.DestroySelf);
        // даем профессию найма
        CfgAddUnitProducer(GlobalVars.configs[this.CfgUid]);
        // добавляем постройку волн
        {
            var producerParams = GlobalVars.configs[this.CfgUid].GetProfessionParams(UnitProducerProfessionParams, UnitProfession.UnitProducer);
            var produceList    = producerParams.CanProduceList;
            produceList.Clear();

            var choise_BaseCfgUid = "#UnitConfig_Barbarian_Swordmen";
            var choise_CfgUid     = this.CfgUid + "_";
            for (var planIdx = 0; planIdx < AttackPlansClass.length; planIdx++) {
                var unitChoise_CfgUid = choise_CfgUid + planIdx;
                GlobalVars.configs[unitChoise_CfgUid] = CreateUnitConfig(choise_BaseCfgUid, unitChoise_CfgUid);

                // назначаем имя
                ScriptUtils.SetValue(GlobalVars.configs[unitChoise_CfgUid], "Name", "Выбрать волну " + planIdx);
                // Броня
                ScriptUtils.SetValue(GlobalVars.configs[unitChoise_CfgUid], "Shield", planIdx);
                // описание
                ScriptUtils.SetValue(GlobalVars.configs[unitChoise_CfgUid], "Description", AttackPlansClass[planIdx].Description);
                // убираем цену
                ScriptUtils.SetValue(GlobalVars.configs[unitChoise_CfgUid].CostResources, "Gold",   0);
                ScriptUtils.SetValue(GlobalVars.configs[unitChoise_CfgUid].CostResources, "Metal",  0);
                ScriptUtils.SetValue(GlobalVars.configs[unitChoise_CfgUid].CostResources, "Lumber", 0);
                ScriptUtils.SetValue(GlobalVars.configs[unitChoise_CfgUid].CostResources, "People", 0);
                // убираем требования
                GlobalVars.configs[unitChoise_CfgUid].TechConfig.Requirements.Clear();

                produceList.Add(GlobalVars.configs[unitChoise_CfgUid]);
            }
        }
        // задаем кастомный обработчик постройки
        setUnitStateWorker(GlobalVars.plugin, GlobalVars.configs[this.CfgUid], UnitState.Produce, this.stateWorker_Produce);
    }

    private static stateWorker_Produce (u: any) {
        if(u.Owner.Resources.TakeResourcesIfEnough(u.OrdersMind.ActiveOrder.ProductUnitConfig.CostResources)) {
            u.ScriptData.TowerProtection_ProductUnitConfig = u.OrdersMind.ActiveOrder.ProductUnitConfig;
        }
        u.OrdersMind.CancelOrdersSafe(true);
    }
}

export const PlayerTowersClass : Array<typeof Player_TOWER_BASE> = [
    Player_TOWER_0,
    Player_TOWER_1,
    Player_TOWER_2,
    Player_TOWER_3,
    Player_TOWER_4,
    Player_TOWER_5
];
