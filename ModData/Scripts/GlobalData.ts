import { IUnit } from "./Types/IUnit";
import { Team } from "./Types/Team";
import { IAttackPlan } from "./Types/IAttackPlan";
import { IBuff } from "./Types/IBuff";
import { Point2D } from "library/common/primitives";
import { Scheduler } from "./ShedulerSystem";

export enum GameState { PreInit, Init, ChoiseDifficult, ChoiseWave, Run, End };
export enum GameMode { Survive, KeepLimits };

export const CFGPrefix : string = "TowerProtection";

export const DeleteUnitParameters  = HordeClassLibrary.World.Objects.Units.DeleteUnitParameters;
export const ReplaceUnitParameters = HordeClassLibrary.World.Objects.Units.ReplaceUnitParameters;
export const PeopleIncomeLevelT    = HordeClassLibrary.World.Settlements.Modules.Misc.PeopleIncomeLevel;
export const UnitQueryFlag         = HordeClassLibrary.UnitComponents.Enumerations.UnitQueryFlag;

// --- Global Variables ---

export class GlobalVars {
    /** текущее игровое состояние */
    private static _gameState: GameState;

    /** время смены игрового тика */
    public static gameStateChangedTickNum: number;
    /** текущий игровой тик */
    public static gameTickNum: number;
    /** массив конфигов */
    public static configs: any;
    /** команды */
    public static teams: Array<Team>;
    /** сложность игры */
    public static difficult: number;
    /** план атаки */
    public static attackPlan: IAttackPlan;
    /** все заскриптованные юниты в игре */
    public static units: Array<IUnit>;
    /** все заскриптованные баффы в игре */
    public static buffs: Array<IBuff>;
    /** рандомайзер */
    public static rnd: any;
    /** Players */
    public static Players: any;
    public static scenaWidth : number;
    public static scenaHeight : number;
    /** юниты на карте */
    public static unitsMap : any;
    public static plugin : any;

    /** @description Планировщик событий для управления периодическими действиями. */
    public static scheduler: Scheduler;

    /** текущий игровой режим */
    public static gameMode: GameMode;
    /** точки патрулирования для режима выживания */
    public static keepLimits_patrolPoints: Array<Point2D>;
    /** периодичность вызова патрулирования */
    public static keepLimits_patrolPeriod: number;

    public static GetGameState() : GameState {
        return this._gameState;
    }
    public static SetGameState(gameState : GameState) {
        this._gameState              = gameState;
        this.gameStateChangedTickNum = this.gameTickNum;
    }
}