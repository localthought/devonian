import { describe, it, expect } from 'vitest';
import { DevonianIndex } from '../../src/DevonianIndex.js';
import {
  SolidMessageWithoutId,
  SolidMessage,
} from '../../examples/DevonianSolid.js';
import {
  SlackMessageWithoutId,
  SlackMessage,
} from '../../examples/DevonianSlack.js';
import { DevonianSolidSlackBridge } from '../../examples/DevonianSolidSlackBridge.js';
import { MockClient } from '../helpers.js';

describe('DevonianSolidSlackBridge', () => {
  const index = new DevonianIndex();
  const solidMockClient = new MockClient<SolidMessageWithoutId, SolidMessage>(
    'solid',
    'uri',
  );
  const slackMockClient = new MockClient<SlackMessageWithoutId, SlackMessage>(
    'slack',
    'ts',
  );
  new DevonianSolidSlackBridge(index, solidMockClient, slackMockClient);
  // console.log('Solid is left, Slack is right');
  it('can go from Solid to Slack', async () => {
    solidMockClient.fakeIncoming({
      uri: 'https://example.com/chat/2025/05/05/chat.ttl#Msg1',
      chatUri: 'https://example.com/chat/index.ttl',
      authorWebId: 'https://example.com/profile/card#me',
      date: undefined,
      text: 'solid text',
      foreignIds: {
        asdf: 'qwer',
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(slackMockClient.added).toEqual([
      {
        text: 'solid text',
        foreignIds: {
          asdf: 'qwer',
          'devonian-test-replica': 0,
          solid: 'https://example.com/chat/2025/05/05/chat.ttl#Msg1',
        },
      },
    ]);
  });

  it('can go from Slack to Solid', async () => {
    slackMockClient.fakeIncoming({
      ts: '1234567890.123',
      channel: 'slack channel',
      user: 'slack user',
      text: 'slack text',
      foreignIds: {
        asdf: 'qwer',
        'devonian-test-replica': 0,
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(solidMockClient.added).toEqual([
      // {
      //   chatUri: undefined,
      //   text: 'slack text',
      //   authorWebId: undefined,
      //   date: new Date('2009-02-13T23:31:30.123Z'),
      //   foreignIds: {
      //     asdf: 'qwer',
      //     'devonian-test-replica': 0,
      //     slack: '1234567890.123',
      //   }
      // }
    ]);
  });
});
