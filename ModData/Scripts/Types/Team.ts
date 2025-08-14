import { Cell } from "./Geometry";
import { IUnit } from "./IUnit";
import { ISpawner } from "./ISpawner";
import { Player_TOWER_BASE } from "../Realizations/Player_units";

export class Team {
    //@ts-ignore
    teimurSettlementIdx: number;
    teimurSettlement:   any;
    //@ts-ignore
    settlementIdx:      number;
    settlement:         any;
    //@ts-ignore
    tower:              IUnit;
    //@ts-ignore
    towerCell:          Cell;
    //@ts-ignore
    spawner:            ISpawner;
    //@ts-ignore
    inGame:             boolean;
    //@ts-ignore
    nickname:           string;
    color:              any;
    
    //@ts-ignore
    incomeGold:         number;
    //@ts-ignore
    incomeMetal:        number;
    //@ts-ignore
    incomeLumber:       number;
    //@ts-ignore
    incomePeople:       number;
}
