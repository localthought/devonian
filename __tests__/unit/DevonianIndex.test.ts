import { describe, it, expect } from 'vitest';
import { DevonianIndex } from '../../src/DevonianIndex.js';

describe('DevonianIndex', () => {
  it('can store equivalences', async () => {
    const index = new DevonianIndex();
    index.storeEquivalences({
      channel: [
        {
          solid:
            'https://michielbdejong.solidcommunity.net/IndividualChats/nlnet-demo/index.ttl#this',
          slack: 'C08RHPHV05D',
        },
      ],
      author: [
        {
          slack: 'U05TRV6UVPV',
          solid: 'https://michielbdejong.solidcommunity.net/profile/card#me',
        },
        {
          slack: 'U0816RHEE85',
          solid: 'https://michielbdejong.solidcommunity.net/profile/card#me',
        },
      ],
    });
    expect(index.ids).toEqual({
      author: [
        {
          slack: 'U0816RHEE85',
          solid: 'https://michielbdejong.solidcommunity.net/profile/card#me',
        },
      ],
      channel: [
        {
          slack: 'C08RHPHV05D',
          solid:
            'https://michielbdejong.solidcommunity.net/IndividualChats/nlnet-demo/index.ttl#this',
        },
      ],
    });
    expect(index.index).toEqual({
      author: {
        slack: {
          U05TRV6UVPV: 0,
          U0816RHEE85: 0,
        },
        solid: {
          'https://michielbdejong.solidcommunity.net/profile/card#me': 0,
        },
      },
      channel: {
        slack: {
          C08RHPHV05D: 0,
        },
        solid: {
          'https://michielbdejong.solidcommunity.net/IndividualChats/nlnet-demo/index.ttl#this': 0,
        },
      },
    });
    expect(
      index.convertId(
        'channel',
        'solid',
        'https://michielbdejong.solidcommunity.net/IndividualChats/nlnet-demo/index.ttl#this',
        'slack',
      ),
    ).toEqual('C08RHPHV05D');
    expect(index.convertId('channel', 'slack', 'C08RHPHV05D', 'solid')).toEqual(
      'https://michielbdejong.solidcommunity.net/IndividualChats/nlnet-demo/index.ttl#this',
    );
    expect(
      index.convertId(
        'author',
        'solid',
        'https://michielbdejong.solidcommunity.net/profile/card#me',
        'slack',
      ),
    ).toEqual('U0816RHEE85');
    expect(index.convertId('author', 'slack', 'U05TRV6UVPV', 'solid')).toEqual(
      'https://michielbdejong.solidcommunity.net/profile/card#me',
    );
    expect(index.convertId('author', 'slack', 'U0816RHEE85', 'solid')).toEqual(
      'https://michielbdejong.solidcommunity.net/profile/card#me',
    );
  });
});
