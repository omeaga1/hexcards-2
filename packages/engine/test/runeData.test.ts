import { describe, expect, it } from 'vitest';
import { publishedRunes, toRuneData, type ClientPerk, type ClientPerkStyles } from '@hexcards/data';

const perks: ClientPerk[] = [
  { id: 8008, name: 'Lethal Tempo', iconPath: '/lol-game-data/assets/v1/perk-images/Styles/Precision/LethalTempo/LethalTempoTemp.png', shortDesc: 'Gain <b>attack speed</b>.<br>Stacks.' },
  { id: 9103, name: 'Legend: Bloodline', iconPath: '/lol-game-data/assets/v1/perk-images/Styles/Precision/LegendBloodline/LegendBloodline.png', shortDesc: 'Lifesteal.' },
  { id: 5005, name: 'Attack Speed', iconPath: '/lol-game-data/assets/v1/perk-images/StatMods/StatModsAttackSpeedIcon.png', shortDesc: '+10% Attack Speed' },
  { id: 9999, name: 'Retired rune', iconPath: '/lol-game-data/assets/v1/perk-images/Old.png', shortDesc: '' },
];
const styles: ClientPerkStyles = {
  styles: [{
    id: 8000,
    name: 'Precision',
    iconPath: '/lol-game-data/assets/v1/perk-images/Styles/7201_Precision.png',
    tooltip: 'Improved attacks',
    slots: [
      { type: 'kKeyStone', perks: [8008] },
      { type: 'kMixedRegularSplashable', perks: [9103] },
      { type: 'kStatMod', perks: [5005] },
    ],
  }],
};

describe('published rune data', () => {
  const published = publishedRunes(perks, styles);

  it('keeps only runes that sit in a tree, with plain-text summaries', () => {
    expect(published.perks.map((p) => p.id)).toEqual([8008, 9103, 5005]);
    expect(published.perks[0]!.summary).toBe('Gain attack speed. Stacks.');
  });

  it('serves icons from Data Dragon under the client path, keeping its case', () => {
    expect(published.perks[1]!.icon).toBe('https://ddragon.leagueoflegends.com/cdn/img/perk-images/Styles/Precision/LegendBloodline/LegendBloodline.png');
    expect(published.styles[0]!.icon).toBe('https://ddragon.leagueoflegends.com/cdn/img/perk-images/Styles/7201_Precision.png');
  });

  it('splits tree rows from shard rows and survives a JSON round trip', () => {
    const data = toRuneData(JSON.parse(JSON.stringify(published)));
    expect(data.styles.get(8000)).toMatchObject({ rows: [[8008], [9103]], shardRows: [[5005]] });
    expect(data.perks.get(5005)?.name).toBe('Attack Speed');
  });
});
