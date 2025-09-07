import { broadcastMessage, createGameMessageWithNoSound } from "library/common/messages";
import { createPoint, createHordeColor, createResourcesAmount } from "library/common/primitives";
import { isReplayMode } from "library/game-logic/game-tools";
import { DrawLayer, FontUtils, UnitDirection, UnitHurtType } from "library/game-logic/horde-types";
import HordePluginBase from "plugins/base-plugin";
import { GameMode, GameState, GlobalVars, PeopleIncomeLevelT, ReplaceUnitParameters } from "./GlobalData";
import { AttackPlansClass } from "./Realizations/AttackPlans";
import { Player_TOWER_BASE, Player_TOWER_CHOISE_DIFFICULT, Player_TOWER_CHOISE_ATTACKPLAN, PlayerTowersClass } from "./Realizations/Player_units";
import { RectangleRingSpawner, RectangleSpawner } from "./Realizations/Spawners";
import { TeimurUnitsClass, TeimurLegendaryUnitsClass } from "./Realizations/Teimur_units";
import { Cell, Rectangle } from "./Types/Geometry";
import { ITeimurUnit } from "./Types/ITeimurUnit";
import { IUnit } from "./Types/IUnit";
import { Team } from "./Types/Team";
import { spawnUnit } from "./Utils";
import { Buff_Improvements, Buff_PeriodHealing, Buff_PeriodIncomeGold, GetBuffsClass } from "./Realizations/Buffs";
import { IBuff } from "./Types/IBuff";
import { spawnString } from "library/game-logic/decoration-spawn";
import { ILegendaryUnit } from "./Types/ILegendaryUnit";
import { Scheduler } from "./ShedulerSystem";

export class TowerProtection extends HordePluginBase {
    //@ts-ignore
    hostPlayerTeamNum : number;

    //@ts-ignore
    // таймеры
    timers: Map<string, number>;
    //@ts-ignore
    // номер команды для оповещения
    notifiedTeamNumber: number;
    //@ts-ignore
    // для команд хранит строки с описанием бафов
    teamsStringDecorationObj: Array<any>;
    //@ts-ignore
    // для режима выживания
    survivalStringDecorationObjs: Array<any>;

    public constructor() {
        super("Башенная защита");

        GlobalVars.SetGameState(GameState.PreInit);
        GlobalVars.plugin = this;
    }

    public onFirstRun() {
    }

    public onEveryTick(gameTickNum: number) {
        GlobalVars.gameTickNum = gameTickNum;

        switch (GlobalVars.GetGameState()) {
            case GameState.PreInit:
                this.PreInit(gameTickNum);
                break;
            case GameState.Init:
                this.Init(gameTickNum);
                break;
            case GameState.ChoiseDifficult:
                this.ChoiseDifficult(gameTickNum);
                break;
            case GameState.ChoiseWave:
                this.ChoiseWave(gameTickNum);
                break;
            case GameState.Run:
                this.Run(gameTickNum);
                break;
            case GameState.End:
                this.End(gameTickNum);
                break;
        }
    }

    private PreInit(gameTickNum: number) {
        this.hostPlayerTeamNum     = -1;
        this.notifiedTeamNumber    = -1;

        GlobalVars.units           = new Array<IUnit>();
        GlobalVars.buffs           = new Array<IBuff>();
        GlobalVars.scheduler       = new Scheduler();

        GlobalVars.gameStateChangedTickNum = 0;
        GlobalVars.Players         = Players;
        GlobalVars.scenaWidth      = ActiveScena.GetRealScena().Size.Width;
        GlobalVars.scenaHeight     = ActiveScena.GetRealScena().Size.Height;
        GlobalVars.unitsMap        = ActiveScena.GetRealScena().UnitsMap;
        GlobalVars.configs         = new Array<any>();

        // профилировка
        this.timers = new Map<string, number>();

        // переходим к следующему состоянию
        GlobalVars.SetGameState(GameState.Init);

        // проверяем, что за карта
        var scenaName = ActiveScena.GetRealScena().ScenaName;
        if (scenaName == "Башенная защита - колесо") {
            GlobalVars.gameMode = GameMode.KeepLimits;

            var towerCells = [
                new Cell(35, 32),
                new Cell(107, 32),
                new Cell(110, 71),
                new Cell(107, 110),
                new Cell(35, 110),
                new Cell(32, 71),
            ];
            // Определяем точки для нового режима
            var spawnRectangles = [
                new Rectangle(32, 0, 8, 8),
                new Rectangle(104, 0, 8, 8),
                new Rectangle(136, 68, 8, 8),
                new Rectangle(104, 136, 8, 8),
                new Rectangle(32, 136, 8, 8),
                new Rectangle(0, 68, 8, 8),
            ];
            // Эти координаты нужно будет подставить реальные
            GlobalVars.keepLimits_patrolPoints = [
                createPoint(35, 27),
                createPoint(107, 27),
                createPoint(115, 71),
                createPoint(107, 115),
                createPoint(35, 115),
                createPoint(27, 71)
            ];
            GlobalVars.keepLimits_patrolPeriod = 0;

            // Инициализация команд (может понадобиться своя логика для этого режима)
            // Пока что оставляем стандартную, но без башен
            GlobalVars.teams = new Array<Team>(6);
            for (var i = 0; i < 6; i++) {
                var teamNum = i;
                GlobalVars.teams[teamNum]                    = new Team();
                GlobalVars.teams[teamNum].teimurSettlementIdx = 6;
                GlobalVars.teams[teamNum].towerCell          = towerCells[teamNum];
                GlobalVars.teams[teamNum].settlementIdx      = teamNum;
                GlobalVars.teams[teamNum].spawner            = new RectangleSpawner(
                    spawnRectangles[teamNum],
                    teamNum
                );
                GlobalVars.teams[teamNum].inGame = false;
            }
        } else if (scenaName == "Башенная защита - стандарт") {
            GlobalVars.gameMode = GameMode.Survive;
            GlobalVars.teams = new Array<Team>(6);
            for (var i = 0; i < 2; i++) {
                for (var j = 0; j < 3; j++) {
                    const teamNum = 3*i + j;
                    const shiftX  = 6*8*j;
                    const shiftY  = 6*8*i;
                    this.log.info("i = ", i, " j = ", j, " teamNum = ", teamNum, " shiftX = ", shiftX, " shiftY = ", shiftY);
                    GlobalVars.teams[teamNum]                    = new Team();
                    GlobalVars.teams[teamNum].teimurSettlementIdx = 6;
                    GlobalVars.teams[teamNum].towerCell          = new Cell(shiftX + 23, shiftY + 23);
                    GlobalVars.teams[teamNum].settlementIdx      = teamNum;
                    GlobalVars.teams[teamNum].spawner            = new RectangleRingSpawner(
                        new Rectangle(shiftX + 2, shiftY + 2, 44, 44),
                        new Rectangle(shiftX + 8, shiftY + 8, 32, 32),
                        teamNum
                    );
                    GlobalVars.teams[teamNum].inGame = false;
                }
            }
        } else {
            GlobalVars.SetGameState(GameState.End);
        }
    }

    private Init(gameTickNum: number) {
        GlobalVars.rnd = ActiveScena.GetRealScena().Context.Randomizer;
        
        //////////////////////////////////////////
        // инициализируем игроков в командах
        //////////////////////////////////////////

        for (var teamNum = 0; teamNum < GlobalVars.teams.length; teamNum++) {
            GlobalVars.teams[teamNum].incomeGold   = 0;
            GlobalVars.teams[teamNum].incomeMetal  = 0;
            GlobalVars.teams[teamNum].incomeLumber = 0;
            GlobalVars.teams[teamNum].incomePeople = 0;
            GlobalVars.teams[teamNum].nickname     = "";
            GlobalVars.teams[teamNum].settlement       = ActiveScena.GetRealScena().Settlements.GetByUid('' + GlobalVars.teams[teamNum].settlementIdx);
            GlobalVars.teams[teamNum].teimurSettlement = ActiveScena.GetRealScena().Settlements.GetByUid('' + GlobalVars.teams[teamNum].teimurSettlementIdx);
            GlobalVars.teams[teamNum].color            = GlobalVars.teams[teamNum].settlement.SettlementColor;
        }

        for (var player of GlobalVars.Players) {
            var realPlayer   = player.GetRealPlayer();
            var settlement   = realPlayer.GetRealSettlement();
            var settlementId = settlement.Uid;

            this.log.info("player of settlementId ", settlementId);

            if (GlobalVars.teams.find((team) => { return team.teimurSettlementIdx == settlementId;}) ||
                (isReplayMode() && !realPlayer.IsReplay)) {
                continue;
            }
            
            // ищем команду в которой данное поселение
            var teamNum = -1;
            for (var _teamNum = 0; _teamNum < GlobalVars.teams.length; _teamNum++) {
                if (GlobalVars.teams[_teamNum].settlementIdx == settlementId) {
                    teamNum = _teamNum;
                    break;
                }
            }
            this.log.info("\t found team ", teamNum);
            if (teamNum == -1) {
                continue;
            }

            GlobalVars.teams[teamNum].inGame = true;
            if (GlobalVars.teams[teamNum].nickname.length > 0) {
                GlobalVars.teams[teamNum].nickname += ","
            }
            GlobalVars.teams[teamNum].nickname += realPlayer.Nickname;

            // запоминаем хоста (он самый первый игрок)
            if (this.hostPlayerTeamNum == -1) {
                this.hostPlayerTeamNum = teamNum;
            }

            // убираем налоги
            var censusModel = ScriptUtils.GetValue(settlement.Census, "Model");
            // Установить период сбора налогов и выплаты жалования (чтобы отключить сбор, необходимо установить 0)
            censusModel.TaxAndSalaryUpdatePeriod = 0;

            // Отключить прирост населения
            censusModel.PeopleIncomeLevels.Clear();
            censusModel.PeopleIncomeLevels.Add(new PeopleIncomeLevelT(0, 0, -1));
            censusModel.LastPeopleIncomeLevel = 0;
        }

        // вычисляем сложность

        GlobalVars.difficult = 1;
        this.log.info("current difficult = ", GlobalVars.difficult);

        //////////////////////////////////////////
        // ставим начальную башню для хоста
        //////////////////////////////////////////

        Player_TOWER_CHOISE_DIFFICULT.InitConfig();

        for (var teamNum = 0; teamNum < GlobalVars.teams.length; teamNum++) {
            if (!GlobalVars.teams[teamNum].inGame) {
                continue;
            }

            this.log.info("teamNum = ", teamNum, " nickName = ", GlobalVars.teams[teamNum].nickname, " towerCell = ", GlobalVars.teams[teamNum].towerCell.X, GlobalVars.teams[teamNum].towerCell.Y);

            var towerUnit = GlobalVars.unitsMap.GetUpperUnit(GlobalVars.teams[teamNum].towerCell.X, GlobalVars.teams[teamNum].towerCell.Y);
            if (towerUnit) {
                GlobalVars.teams[teamNum].tower = new IUnit(towerUnit, teamNum);
            } else {
                GlobalVars.teams[teamNum].tower = new IUnit(spawnUnit(
                    GlobalVars.teams[teamNum].settlement,
                    HordeContentApi.GetUnitConfig(Player_TOWER_CHOISE_DIFFICULT.BaseCfgUid),
                    UnitDirection.Down,
                    createPoint(GlobalVars.teams[teamNum].towerCell.X, GlobalVars.teams[teamNum].towerCell.Y)
                ), teamNum);
            }
        }

        //////////////////////////////////////////
        // размещаем замок для выбора сложности
        //////////////////////////////////////////

        let replaceParams                 = new ReplaceUnitParameters();
        replaceParams.OldUnit             = GlobalVars.teams[this.hostPlayerTeamNum].tower.unit;
        replaceParams.NewUnitConfig       = GlobalVars.configs[Player_TOWER_CHOISE_DIFFICULT.CfgUid];
        replaceParams.Cell                = createPoint(GlobalVars.teams[this.hostPlayerTeamNum].towerCell.X, GlobalVars.teams[this.hostPlayerTeamNum].towerCell.Y);  // Можно задать клетку, в которой должен появиться новый юнит. Если null, то центр создаваемого юнита совпадет с предыдущим
        replaceParams.PreserveHealthLevel = false; // Нужно ли передать уровень здоровья? (в процентном соотношении)
        replaceParams.PreserveOrders      = false; // Нужно ли передать приказы?
        replaceParams.Silent              = true;  // Отключение вывода в лог возможных ошибок (при регистрации и создании модели)
        GlobalVars.teams[this.hostPlayerTeamNum].tower = new Player_TOWER_CHOISE_DIFFICULT(GlobalVars.teams[this.hostPlayerTeamNum].tower.unit.Owner.Units.ReplaceUnit(replaceParams), this.hostPlayerTeamNum);

        // отбираем все деньги

        for (var teamNum = 0; teamNum < GlobalVars.teams.length; teamNum++) {
            if (!GlobalVars.teams[teamNum].inGame) {
                continue;
            }

            GlobalVars.teams[teamNum].settlement.Resources.TakeResources(GlobalVars.teams[teamNum].settlement.Resources.GetCopy());
        }

        // инициализируем строковые декорации игроков

        if (!this.teamsStringDecorationObj) {
            this.teamsStringDecorationObj = new Array<number>(GlobalVars.teams.length);
            for (var teamNum = 0; teamNum < GlobalVars.teams.length; teamNum++) {
                if (!GlobalVars.teams[teamNum].inGame) {
                    continue;
                }

                var strDecObj = spawnString(
                    ActiveScena,
                    GlobalVars.teams[teamNum].nickname + ":\n",
                    createPoint(32*(GlobalVars.teams[teamNum].towerCell.X - 20), 32*(GlobalVars.teams[teamNum].towerCell.Y - 20)),
                    100000000);
                strDecObj.Height = 20;
                //strDecObj.Color = GlobalVars.teams[teamNum].color;
                strDecObj.Color     = createHordeColor(
                    255,
                    Math.min(255, GlobalVars.teams[teamNum].color.R + 128),
                    Math.min(255, GlobalVars.teams[teamNum].color.G + 128),
                    Math.min(255, GlobalVars.teams[teamNum].color.B + 128)
                );
                strDecObj.DrawLayer = DrawLayer.Birds;
                //strDecObj.Font = FontUtils.DefaultFont;        // Шрифт Северного Ветра (нельзя изменить высоту букв)
                //@ts-ignore
                strDecObj.Font = FontUtils.DefaultVectorFont;  // Шрифт, что используется в чате

                this.teamsStringDecorationObj[teamNum] = strDecObj;
            }
        }

        if (GlobalVars.gameMode == GameMode.KeepLimits) {
            this.survivalStringDecorationObjs = new Array<any>(GlobalVars.teams.length);
            for (var teamNum = 0; teamNum < GlobalVars.teams.length; teamNum++) {
                if (!GlobalVars.teams[teamNum].inGame) {
                    continue;
                }

                var strDecObj = spawnString(
                    ActiveScena,
                    "Врагов на карте: 0",
                    createPoint(32*(GlobalVars.teams[teamNum].towerCell.X - 20), 32*(GlobalVars.teams[teamNum].towerCell.Y - 21)),
                    100000000);
                strDecObj.Height = 20;
                strDecObj.Color = createHordeColor(255, 255, 100, 0);
                strDecObj.DrawLayer = DrawLayer.Birds;
                //@ts-ignore
                strDecObj.Font = FontUtils.DefaultVectorFont;

                this.survivalStringDecorationObjs[teamNum] = strDecObj;
            }
        }

        GlobalVars.SetGameState(GameState.ChoiseDifficult);
    }

    private ChoiseDifficult(gameTickNum: number) {
        // проверяем выбирается ли сложность
        if (!GlobalVars.teams[this.hostPlayerTeamNum].tower.unit.ScriptData.TowerProtection_ProductUnitConfig &&
            GlobalVars.teams[this.hostPlayerTeamNum].tower.unit.ScriptData.TowerProtection_ProductUnitConfig == null
        ) {
            return;
        }
        
        // выбранная сложность
        GlobalVars.difficult = parseInt(GlobalVars.teams[this.hostPlayerTeamNum].tower.unit.ScriptData.TowerProtection_ProductUnitConfig.Shield);
        delete GlobalVars.teams[this.hostPlayerTeamNum].tower.unit.ScriptData.TowerProtection_ProductUnitConfig;
        this.log.info("selected difficult = ", GlobalVars.difficult);
        broadcastMessage("Была выбрана сложность " + GlobalVars.difficult, createHordeColor(255, 140, 140, 140));

        // заменяем данный замок на замок выбора волны

        Player_TOWER_CHOISE_ATTACKPLAN.InitConfig();

        // GlobalVars.teams[this.hostPlayerTeamNum].tower.unit.Delete();
        // GlobalVars.teams[this.hostPlayerTeamNum].tower.unit = null;
        // GlobalVars.teams[this.hostPlayerTeamNum].tower = new Player_TOWER_CHOISE_ATTACKPLAN(spawnUnit(
        //     GlobalVars.teams[this.hostPlayerTeamNum].settlement,
        //     GlobalVars.configs[Player_TOWER_CHOISE_ATTACKPLAN.CfgUid],
        //     UnitDirection.Down,
        //     createPoint(GlobalVars.teams[this.hostPlayerTeamNum].towerCell.X, GlobalVars.teams[this.hostPlayerTeamNum].towerCell.Y)
        // ), this.hostPlayerTeamNum);

        Player_TOWER_CHOISE_ATTACKPLAN.InitConfig();
        let replaceParams = new ReplaceUnitParameters();
        this.log.info("this.hostPlayerTeamNum = ", this.hostPlayerTeamNum);
        replaceParams.OldUnit = GlobalVars.teams[this.hostPlayerTeamNum].tower.unit;
        replaceParams.NewUnitConfig = GlobalVars.configs[Player_TOWER_CHOISE_ATTACKPLAN.CfgUid];
        replaceParams.Cell = createPoint(GlobalVars.teams[this.hostPlayerTeamNum].towerCell.X, GlobalVars.teams[this.hostPlayerTeamNum].towerCell.Y);;                   // Можно задать клетку, в которой должен появиться новый юнит. Если null, то центр создаваемого юнита совпадет с предыдущим
        replaceParams.PreserveHealthLevel = false;   // Нужно ли передать уровень здоровья? (в процентном соотношении)
        replaceParams.PreserveOrders = false;        // Нужно ли передать приказы?
        replaceParams.Silent = true;                 // Отключение вывода в лог возможных ошибок (при регистрации и создании модели)
        GlobalVars.teams[this.hostPlayerTeamNum].tower = new Player_TOWER_CHOISE_ATTACKPLAN(GlobalVars.teams[this.hostPlayerTeamNum].tower.unit.Owner.Units.ReplaceUnit(replaceParams), this.hostPlayerTeamNum);

        // меняем состояние игры
        GlobalVars.SetGameState(GameState.ChoiseWave);
    }

    private ChoiseWave(gameTickNum: number) {
        var FPS = HordeResurrection.Engine.Logic.Battle.BattleController.GameTimer.CurrentFpsLimit;

        //////////////////////////////////////////
        // выбор волны
        //////////////////////////////////////////

        var choisedAttackPlanIdx = -1;

        // проверяем выбирается ли волна
        if (!GlobalVars.teams[this.hostPlayerTeamNum].tower.unit.ScriptData.TowerProtection_ProductUnitConfig &&
            GlobalVars.teams[this.hostPlayerTeamNum].tower.unit.ScriptData.TowerProtection_ProductUnitConfig == null
        ) {
            return;
        }

        // выбранная волна
        this.log.info("selected wave ", GlobalVars.teams[this.hostPlayerTeamNum].tower.unit.ScriptData.TowerProtection_ProductUnitConfig.Shield);
        choisedAttackPlanIdx = parseInt(GlobalVars.teams[this.hostPlayerTeamNum].tower.unit.ScriptData.TowerProtection_ProductUnitConfig.Shield);
        delete GlobalVars.teams[this.hostPlayerTeamNum].tower.unit.ScriptData.TowerProtection_ProductUnitConfig;

        // проверяем, что выбран план атаки
        if (choisedAttackPlanIdx == -1) {
            return;
        }

        //////////////////////////////////////////
        // инициализация
        //////////////////////////////////////////

        // запоминаем тик начала игры
        GlobalVars.gameStateChangedTickNum = gameTickNum;
        GlobalVars.SetGameState(GameState.Run);

        // инициализируем конфиги

        var allUnitsClass = [
            ...TeimurUnitsClass,
            ...TeimurLegendaryUnitsClass,
            ...PlayerTowersClass
        ];
        for (var i = 0; i < allUnitsClass.length; i++) {
            allUnitsClass[i].InitConfig();
        }

        const buffs = GetBuffsClass();
        for (var i = 0; i < buffs.length; i++) {
            buffs[i].InitConfig();
        }

        // инициализируем план атаки

        GlobalVars.attackPlan = new AttackPlansClass[choisedAttackPlanIdx]();
        broadcastMessage("Был выбран план атаки " + choisedAttackPlanIdx, createHordeColor(255, 140, 140, 140));
        broadcastMessage(AttackPlansClass[choisedAttackPlanIdx].Description, createHordeColor(255, 140, 140, 140));
        {
            var secondsLeft = Math.round(GlobalVars.attackPlan.waves[0].gameTickNum) / FPS;
            var minutesLeft = Math.floor(secondsLeft / 60);
            secondsLeft    -= minutesLeft * 60;
            secondsLeft     = Math.round(secondsLeft);
            broadcastMessage("До начала волны " + (minutesLeft > 0 ? minutesLeft + " минут " : "") + secondsLeft + " секунд", createHordeColor(255, 255, 50, 10));
        }

        // считаем сколько будет врагов

        var unitsTotalCount = GlobalVars.attackPlan.GetUnitsCount();
        for (var unitCfg in unitsTotalCount) {
            this.log.info(unitCfg, " ", unitsTotalCount[unitCfg]);
        }

        for (var teamNum = 0; teamNum < GlobalVars.teams.length; teamNum++) {
            if (!GlobalVars.teams[teamNum].inGame) {
                continue;
            }

            // GlobalVars.teams[teamNum].tower.unit.Delete();
            // GlobalVars.teams[teamNum].tower.unit = null;
            // GlobalVars.teams[teamNum].tower = new PlayerTowersClass[teamNum](spawnUnit(
            //     GlobalVars.teams[teamNum].settlement,
            //     GlobalVars.configs[PlayerTowersClass[teamNum].CfgUid],
            //     UnitDirection.Down,
            //     createPoint(GlobalVars.teams[teamNum].towerCell.X, GlobalVars.teams[teamNum].towerCell.Y)
            // ), teamNum);
            
            let replaceParams                 = new ReplaceUnitParameters();
            replaceParams.OldUnit             = GlobalVars.teams[teamNum].tower.unit;
            replaceParams.NewUnitConfig       = GlobalVars.configs[PlayerTowersClass[teamNum].CfgUid];
            replaceParams.Cell                = createPoint(GlobalVars.teams[teamNum].towerCell.X, GlobalVars.teams[teamNum].towerCell.Y);  // Можно задать клетку, в которой должен появиться новый юнит. Если null, то центр создаваемого юнита совпадет с предыдущим
            replaceParams.PreserveHealthLevel = false; // Нужно ли передать уровень здоровья? (в процентном соотношении)
            replaceParams.PreserveOrders      = false; // Нужно ли передать приказы?
            replaceParams.Silent              = true;  // Отключение вывода в лог возможных ошибок (при регистрации и создании модели)
            GlobalVars.teams[teamNum].tower   = new PlayerTowersClass[teamNum](GlobalVars.teams[teamNum].tower.unit.Owner.Units.ReplaceUnit(replaceParams), teamNum);
            this.log.info("спавним для teamNum ", teamNum, " towerclassname = ", PlayerTowersClass[teamNum].name);

            GlobalVars.units.push(GlobalVars.teams[teamNum].tower);
            GlobalVars.buffs.push(new Buff_Improvements(teamNum));
            GlobalVars.buffs.push(new Buff_PeriodIncomeGold(teamNum));
            GlobalVars.buffs.push(new Buff_PeriodIncomeGold(teamNum));
            GlobalVars.buffs.push(new Buff_PeriodIncomeGold(teamNum));
            GlobalVars.buffs.push(new Buff_PeriodIncomeGold(teamNum));
            GlobalVars.buffs.push(new Buff_PeriodIncomeGold(teamNum));
            GlobalVars.buffs.push(new Buff_PeriodHealing(teamNum));
            GlobalVars.teams[teamNum].incomeGold = 1000;
        }

        // подписываемся на событие о замене юнита (поддержка LevelSystem)

        let scenaSettlements = ActiveScena.GetRealScena().Settlements;
        for (var settlementNum = 0; settlementNum < scenaSettlements.Count; settlementNum++) {
            var settlementUnits = scenaSettlements.Item.get(settlementNum + '').Units;

            settlementUnits.UnitReplaced.connect(
                function (sender, args: any) {
                    // если производится заменя юнита, который в списке юнитов, то нужно переинициализировать его
                    if (!args.OldUnit.ScriptData.ExperienceSystem) {
                        return;
                    }
                    for (var unitNum = 0; unitNum < GlobalVars.units.length; unitNum++) {
                        if (args.OldUnit.Id == GlobalVars.units[unitNum].unit.Id) {
                            GlobalVars.units[unitNum].needDeleted = true;
                            GlobalVars.units.push(GlobalVars.units[unitNum].constructor(args.NewUnit, GlobalVars.units[unitNum].teamNum));

                            // если конфига нету в системе, то инициализируем его
                            if (!GlobalVars.configs[args.NewUnit.Cfg.Uid]) {
                                var prev_BaseCfgUid     = ITeimurUnit.BaseCfgUid;
                                var prev_CfgUid         = ITeimurUnit.CfgUid;
                                ITeimurUnit.BaseCfgUid  = args.NewUnit.Cfg.Uid;
                                ITeimurUnit.CfgUid      = args.NewUnit.Cfg.Uid;
                                ITeimurUnit.InitConfig();
                                ITeimurUnit.BaseCfgUid  = prev_BaseCfgUid;
                                ITeimurUnit.CfgUid      = prev_CfgUid;
                            }
                            break;
                        }
                    }
            });
        }
    }

    private GetTeimurUnits () : number {
        let teimurUnitCount = 0;
        for (const unit of GlobalVars.units) {
            // Проверяем, что юнит - враг. Можно использовать instanceof
            // или добавить флаг в ITeimurUnit.
            if (unit instanceof ITeimurUnit) {
                if (!unit.unit.IsDead) teimurUnitCount++;
            }
        }
        return teimurUnitCount;
    }

    private Run(gameTickNum: number) {
        // смещаем номер такта, чтобы время считалось относительно начала игры
        gameTickNum -= GlobalVars.gameStateChangedTickNum;

        var FPS = HordeResurrection.Engine.Logic.Battle.BattleController.FpsCounter.CurrentFps;

        // ==================================================
        //      ЛОГИКА РЕЖИМА ВЫЖИВАНИЯ
        // ==================================================
        if (GlobalVars.gameMode == GameMode.KeepLimits) {
            if (gameTickNum % 50 == 5) { // Проверяем раз в секунду
                let teimurUnitCount = this.GetTeimurUnits();

                let playerCount = 0;
                for (var i = 0; i < GlobalVars.teams.length; i++) {
                    if (GlobalVars.teams[i].inGame) {
                        playerCount++;
                    }
                }
                let maxEnemies = 300 + 50 * playerCount;

                // Update decorator text and color
                if (this.survivalStringDecorationObjs) {
                    let percentage = Math.min(1, teimurUnitCount / maxEnemies);
                    let greenBlue = Math.round(255 * (1 - percentage));
                    let newColor = createHordeColor(255, 255, greenBlue, greenBlue);

                    for (var teamNum = 0; teamNum < GlobalVars.teams.length; teamNum++) {
                        if (!GlobalVars.teams[teamNum].inGame) {
                            continue;
                        }
                        if (this.survivalStringDecorationObjs[teamNum]) {
                            this.survivalStringDecorationObjs[teamNum].Text = "Врагов на карте: " + teimurUnitCount + " / " + maxEnemies;
                            this.survivalStringDecorationObjs[teamNum].Color = newColor;
                        }
                    }
                }

                if (teimurUnitCount > maxEnemies) {
                    broadcastMessage("Врагов стало слишком много! Поражение!", createHordeColor(255, 255, 0, 0));
                    // Завершаем игру для всех
                    for (var teamNum = 0; teamNum < GlobalVars.teams.length; teamNum++) {
                        if (GlobalVars.teams[teamNum].inGame) {
                            GlobalVars.teams[teamNum].settlement.Existence.ForceTotalDefeat();
                        }
                    }
                    GlobalVars.SetGameState(GameState.End);
                    return; // Выходим из функции Run
                }
            }
        }

        // проверяем не конец игры ли

        var time     = new Date().getTime();
        if (GlobalVars.attackPlan.waves.length <= GlobalVars.attackPlan.waveNum) {
            GlobalVars.SetGameState(GameState.End);

            // замок с максимальных ХП побеждает
            var victory_teamNum = -1;
            var victory_castleHP = 0;
            for (var teamNum = 0; teamNum < GlobalVars.teams.length; teamNum++) {
                if (!GlobalVars.teams[teamNum].inGame ||
                    GlobalVars.teams[teamNum].tower.unit.IsDead) {
                    continue;
                }

                if (victory_teamNum == -1 || (victory_castleHP < GlobalVars.teams[teamNum].tower.unit.Health)) {
                    victory_teamNum  = teamNum;
                    victory_castleHP = GlobalVars.teams[teamNum].tower.unit.Health;
                }
            }
            for (var teamNum = 0; teamNum < GlobalVars.teams.length; teamNum++) {
                if (teamNum == victory_teamNum) {
                    GlobalVars.teams[teamNum].settlement.Existence.ForceVictory();
                } else {
                    GlobalVars.teams[teamNum].settlement.Existence.ForceTotalDefeat();
                }
            }
            return;
        } else if (gameTickNum % 50 == 0) {
            // присуждаем поражение, если замок уничтожен
            for (var teamNum = 0; teamNum < GlobalVars.teams.length; teamNum++) {
                if (!GlobalVars.teams[teamNum].inGame) {
                    continue;
                }

                if (GlobalVars.teams[teamNum].tower.unit.IsDead && GlobalVars.teams[teamNum].tower.unit.ScriptData.DefenceFromTeimur_IsDefeat == undefined) {
                    broadcastMessage(GlobalVars.teams[teamNum].nickname + " проиграл, он продержался " + gameTickNum + " тактов!", GlobalVars.teams[teamNum].settlement.SettlementColor);
                    GlobalVars.teams[teamNum].tower.unit.ScriptData.DefenceFromTeimur_IsDefeat = true;
                    GlobalVars.teams[teamNum].settlement.Existence.ForceTotalDefeat();

                    // убиваем юнитов, которые атаковали эту команду игроков

                    for (var unitNum = 0; unitNum < GlobalVars.units.length; unitNum++) {
                        if (GlobalVars.units[unitNum].teamNum == teamNum) {
                            GlobalVars.units[unitNum].unit.BattleMind.InstantDeath(null, UnitHurtType.Mele);
                        }
                    }

                    // уничтожаем баффы

                    for (var buffNum = 0; buffNum < GlobalVars.buffs.length; buffNum++) {
                        if (GlobalVars.buffs[buffNum].teamNum == teamNum) {
                            GlobalVars.buffs[buffNum].needDeleted = true;
                        }
                    }
                }
            }

            // проверяем не уничтожены ли все замки
            var allCastlesDead = true;
            for (var teamNum = 0; teamNum < GlobalVars.teams.length; teamNum++) {
                if (!GlobalVars.teams[teamNum].inGame) {
                    continue;
                }

                if (!GlobalVars.teams[teamNum].tower.unit.IsDead) {
                    allCastlesDead = false;
                    break;
                }
            }
            if (allCastlesDead) {
                GlobalVars.SetGameState(GameState.End);
            }
        }
        this.timers.set("Defeat/EndGameChecks", (this.timers.get("Defeat/EndGameChecks") || 0) + new Date().getTime() - time);

        // оповещаем сколько осталось и о игроке

        if (gameTickNum % (30 * FPS) == 0 && GlobalVars.GetGameState() != GameState.End) {
            this.notifiedTeamNumber = (this.notifiedTeamNumber + 1) % GlobalVars.teams.length;
            while (!GlobalVars.teams[this.notifiedTeamNumber].inGame  ||
                GlobalVars.teams[this.notifiedTeamNumber].tower.unit.IsDead) {
                this.notifiedTeamNumber = (this.notifiedTeamNumber + 1) % GlobalVars.teams.length;
            }

            // ищем 3 максимальный баффа
            var sortedBuffsIdx : Array<number> = Array.from(Array(Buff_Improvements.TowersBuffsCount[this.notifiedTeamNumber].length).keys());
            sortedBuffsIdx.sort((a : number, b : number) => {
                return Buff_Improvements.TowersBuffsCount[this.notifiedTeamNumber][b] - Buff_Improvements.TowersBuffsCount[this.notifiedTeamNumber][a];
            });

            var secondsLeft     = Math.round(GlobalVars.attackPlan.waves[GlobalVars.attackPlan.waves.length - 1].gameTickNum - gameTickNum) / FPS;
            var minutesLeft     = Math.floor(secondsLeft / 60);
            secondsLeft        -= minutesLeft * 60;
            secondsLeft         = Math.round(secondsLeft);
            let msgStr : string = "Осталось продержаться " + (minutesLeft > 0 ? minutesLeft + " минут " : "") + secondsLeft + " секунд\n";
            if (GlobalVars.gameMode == GameMode.KeepLimits) {
                msgStr += "Врагов на карте: " + this.GetTeimurUnits() + "\n";
            }
            msgStr             += "Самые мощные баффы игрока " + GlobalVars.teams[this.notifiedTeamNumber].nickname + ":\n";
            for (var i = 0; i < 3; i++) {
                var buffIdx = sortedBuffsIdx[i];
                msgStr += "\t" + GlobalVars.configs[Buff_Improvements.ImprovementsBuffsClass[buffIdx].CfgUid].Name + " : " + Buff_Improvements.TowersBuffsCount[this.notifiedTeamNumber][buffIdx] + "\n"
            }

            var msg = createGameMessageWithNoSound(msgStr, GlobalVars.teams[this.notifiedTeamNumber].color);
            for (var teamNum = 0; teamNum < GlobalVars.teams.length; teamNum++) {
                if (!GlobalVars.teams[teamNum].inGame) {
                    continue;
                }
                GlobalVars.teams[teamNum].settlement.Messages.AddMessage(msg);
            }
        }

        // пишем на карте о 3-ех максимальных бафах

        if (gameTickNum % 60 == 4) {
            for (var teamNum = 0; teamNum < GlobalVars.teams.length; teamNum++) {
                if (!GlobalVars.teams[teamNum].inGame ||
                    GlobalVars.teams[teamNum].tower.unit.IsDead) {
                    continue;
                }

                var sortedBuffsIdx : Array<number> = Array.from(Array(Buff_Improvements.TowersBuffsCount[teamNum].length).keys());
                sortedBuffsIdx.sort((a : number, b : number) => {
                    return Buff_Improvements.TowersBuffsCount[teamNum][b] - Buff_Improvements.TowersBuffsCount[teamNum][a];
                });

                this.teamsStringDecorationObj[teamNum].Text = GlobalVars.teams[teamNum].nickname + ", продержался тактов : " + gameTickNum + ", баффы :\n";
                for (var buffNum = 0; buffNum < sortedBuffsIdx.length; buffNum++) {
                    var buffIdx = sortedBuffsIdx[buffNum];
                    this.teamsStringDecorationObj[teamNum].Text += "\t" + Buff_Improvements.TowersBuffsCount[teamNum][buffIdx] + " : " + GlobalVars.configs[Buff_Improvements.ImprovementsBuffsClass[buffIdx].CfgUid].Name + "\n";
                }
            }
        }

        // спавнер

        time     = new Date().getTime();
        if (gameTickNum % 50 == 1) {
            for (var teamNum = 0; teamNum < GlobalVars.teams.length; teamNum++) {
                if (!GlobalVars.teams[teamNum].inGame ||
                    GlobalVars.teams[teamNum].tower.unit.IsDead) {
                    continue;
                }
                GlobalVars.teams[teamNum].spawner.OnEveryTick(gameTickNum);
            }
        }
        this.timers.set("Spawners", (this.timers.get("Spawners") || 0) + new Date().getTime() - time);

        // инком

        time     = new Date().getTime();
        if (gameTickNum % 100 == 2) {
            for (var teamNum = 0; teamNum < GlobalVars.teams.length; teamNum++) {
                if (!GlobalVars.teams[teamNum].inGame ||
                    GlobalVars.teams[teamNum].tower.unit.IsDead) {
                    continue;
                }

                // проверка, что есть инком
                if (GlobalVars.teams[teamNum].incomeGold   == 0 &&
                    GlobalVars.teams[teamNum].incomeMetal  == 0 &&
                    GlobalVars.teams[teamNum].incomeLumber == 0 &&
                    GlobalVars.teams[teamNum].incomePeople == 0) {
                    continue;
                }

                // даем ресурсы
                GlobalVars.teams[teamNum].settlement.Resources.AddResources(
                    createResourcesAmount(
                        GlobalVars.teams[teamNum].incomeGold,
                        GlobalVars.teams[teamNum].incomeMetal,
                        GlobalVars.teams[teamNum].incomeLumber,
                        GlobalVars.teams[teamNum].incomePeople));

                // зануляем ресы
                GlobalVars.teams[teamNum].incomeGold   = 0;
                GlobalVars.teams[teamNum].incomeMetal  = 0;
                GlobalVars.teams[teamNum].incomeLumber = 0;
                GlobalVars.teams[teamNum].incomePeople = 0;
            }
        }
        this.timers.set("Income", (this.timers.get("Income") || 0) + new Date().getTime() - time);

        // обработка юнитов (57 %)

        time     = new Date().getTime();
        for (var unitNum = 0; unitNum < GlobalVars.units.length; unitNum++) {
            const unit = GlobalVars.units[unitNum];
            
            // Основная логика юнитов теперь в OnScheduledEvent.
            // Здесь мы только обрабатываем удаление мертвых или ненужных юнитов.
            if (unit.needDeleted) {
                GlobalVars.units.splice(unitNum--, 1);
            }
        }
        this.timers.set("Units", (this.timers.get("Units") || 0) + new Date().getTime() - time);

        // обработка баффов (41 %)

        time     = new Date().getTime();

        // Корректируем лимит планировщика раз в секунду
        if (gameTickNum % 50 == 0) {
            var limit = GlobalVars.scheduler.AdjustLimit(FPS);
            if (gameTickNum % 50 * 60 * 5 == 0) {
                this.log.info("scheduler::limit = ", limit, " FPS " , FPS)
            }
        }

        // Запускаем обработку событий из планировщика
        GlobalVars.scheduler.Execute(gameTickNum);

        for (var buffNum = 0; buffNum < GlobalVars.buffs.length; buffNum++) {
            const buff = GlobalVars.buffs[buffNum];

            // Пропускаем баффы, которые работают через новый планировщик
            if (buff.usesScheduler) {
                // нужно проверять только удаление, т.к. такие баффы могут быть удалены (например, при продаже)
                if (buff.needDeleted) {
                    buff.OnDead(gameTickNum);
                    GlobalVars.buffs.splice(buffNum--, 1);
                }
                continue;
            }

            // бафф сам запросил, что его нужно удалить из списка
            if (buff.needDeleted) {
                buff.OnDead(gameTickNum);
                GlobalVars.buffs.splice(buffNum--, 1);
            }
            // настало время для обработки бафф
            else if (gameTickNum % buff.processingTickModule == buff.processingTick) {
                const buffTickTime = new Date().getTime();
                buff.OnEveryTick(gameTickNum);
                const tickTime = new Date().getTime() - buffTickTime;
                const buffName = buff.constructor.name;
                this.timers.set(`OnEveryTick_${buffName}`, (this.timers.get(`OnEveryTick_${buffName}`) || 0) + tickTime);
            }
        }
        this.timers.set("Buffs", (this.timers.get("Buffs") || 0) + new Date().getTime() - time);

        // если закончилась игра, то

        if (GlobalVars.GetGameState() == GameState.End) {
            broadcastMessage("Игра начнется через 10 секунд!", createHordeColor(255, 140, 140, 140));
        }

        if (gameTickNum % 5000 == 0) {
            // выводим статистику
            var str = "[PROFILE]\n";
            for (const [key, value] of Array.from(this.timers.entries())) {
                if (value == 0) {
                    continue;
                }
                str += key + " = " + value + "\n";
            }
            this.log.info(str);
        }
    }

    private End(gameTickNum: number) {
        if (GlobalVars.gameStateChangedTickNum + 10*50 < gameTickNum) {
            GlobalVars.SetGameState(GameState.PreInit);
            // тут нужно TotalDefead превратить в что-то другое
            for (var teamNum = 0; teamNum < GlobalVars.teams.length; teamNum++) {
                if (!GlobalVars.teams[teamNum].inGame) {
                    continue;
                }
                ScriptUtils.SetValue(GlobalVars.teams[teamNum].settlement.Existence, "Status", HordeClassLibrary.World.Settlements.Existence.ExistenceStatus.CombatNow);
            }
            // выводим статистику
            var str = "[PROFILE]\n";
            for (const [key, value] of Array.from(this.timers.entries())) {
                if (value == 0) {
                    continue;
                }
                str += key + " = " + value + "\n";
            }
            this.log.info(str);
        }
    }
}
