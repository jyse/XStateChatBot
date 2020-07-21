import { Machine } from 'xstate';
import { assign } from 'xstate';

// States
export const intro = 'intro';
export const question = 'question';
export const newTicket = 'newTicket';
export const findTicket = 'findTicket';
export const pending = 'pending';
export const done = 'done';
export const error = 'error';
export const noResults = 'noResults';
export const pingTicket = 'pingTicket';
export const shouldSkip = 'shouldSkip';
export const skipped = 'skipped';
export const itemOrdered = 'itemOrdered';

// getQuestionByStateKey
export const getQuestionByStateKey = (key) => {
  const byKey = {
    [intro]: 'Konnichiwa How may I help you today?',
    [newTicket]: 'What would you like to order?',
    [findTicket]: 'Please enter a ticket number',
    [pingTicket]: 'What you like to send a ping to this ticket?'
  };

  return (
    byKey[key] && {
      question: byKey[key],
      key: key
    }
  );
};

// API
export const getPeripheralAPI = (item) =>
  new Promise((resolve, reject) => {
    setTimeout(() => {
      const res = {
        monitor: () => resolve({ item, count: 23 }),
        laptop: () => resolve({ item, count: 0 }),
        mouse: () => reject('NOPE')
      };

      res[item] ? res[item]() : reject('NOPE');
    }, 500);
  });

export const getTicketAPI = (ticket) =>
  new Promise((resolve, reject) => {
    setTimeout(() => {
      const res = {
        '200': () => resolve({ ticket, item: 'monitor', pinged: true }),
        '202': () => resolve({ ticket, item: 'monitor', pinged: false }),
        '400': () => resolve({ ticket, item: null }),
        '500': () => reject('NOPE')
      };

      res[ticket] ? res[ticket]() : reject('NOPE');
    }, 500);
  });

const updateQuery = (ctx, { data }) => {
  const { value, key } = data;
  const byKey = {
    [newTicket]: () => ({ peripheral: value }),
    [findTicket]: () => ({ ticket: value })
  };

  return byKey[key] ? byKey[key]() : {};
};

const updateChat = (ctx, { data }) =>
    ctx.chat.map((chatItem) =>
      chatItem.key === data.key
        ? {
            ...chatItem,
            answer: data.label
          }
        : chatItem
  );

const updateCtxWithAnswer = assign({
  query: updateQuery,
  chat: updateChat
});

const updateCtxWithResults = assign({
  results: (ctx, { data }) => data
});

const askQuestion = (key) => assign({
  chat: (ctx) => [].concat(ctx.chat, getQuestionByStateKey(key))
});

const askIntroQuestion = askQuestion(intro);
const askNewTicket = askQuestion(newTicket);
const askFindTicket = askQuestion(findTicket);
const askPingTicket = askQuestion(pingTicket);

const skipPing = assign({
  chat: (ctx) => updateChat(ctx, {
    data: {
      key: pingTicket,
      label: 'No'
    }
  })
});


const flowMachine = Machine({
  initial: intro,
  states: {
    [intro]: {
      initial: question,
      on: {
        ['AnswerUser']: [
          {
            target: newTicket,
            cond: 'shouldCreateNewTicket',
            actions: 'updateCtxWithAnswer'
          },
          {
            target: findTicket,
            cond: 'shouldFindTicket',
            actions: 'updateCtxWithAnswer'
          }
        ]
      },
      states: {
        [question]: { onEntry: 'askIntroQuestion' }
      }
    },

    [newTicket]: {
      initial: question,
      on: {
        ['AnswerUser']: { target: `.${pending}`, actions: 'updateCtxWithAnswer' }
      },
      states: {
        [question]: { onEntry: 'askNewTicket' },
        [error]: {},
        [noResults]: {},
        [pending]: {
          invoke: {
            src: 'getPeripheral',
            onDone: [
              {
                target: done,
                actions: 'updateCtxWithResults',
                cond: 'hasItems'
              },
              { target: noResults }
            ],
            onError: error
          }
        },
        [done]: {
          type: 'final'
        }
      },
      onDone: itemOrdered
    },

    [findTicket]: {
      initial: question,
      on: {
        ['AnswerUser']: { target: `.${pending}`, actions: 'updateCtxWithAnswer' }
      },
      states: {
        [question]: { onEntry: 'askFindTicket' },
        [error]: {},
        [noResults]: {},
        [pending]: {
          invoke: {
            src: 'getTicket',
            onDone: [
              {
                target: done,
                actions: 'updateCtxWithResults',
                cond: 'foundTicket'
              },
              { target: noResults }
            ],
            onError: error
          }
        },
        [done]: { type: 'final' }
      },
      onDone: pingTicket
    },

    [pingTicket]: {
      initial: shouldSkip,
      on: {
        ['AnswerUser']: [
          {
            target: `.${done}`,
            actions: 'updateCtxWithAnswer',
            cond: 'shouldSendPing'
          },
          {
            target: `.${skipped}`,
            actions: 'skipPing'
          }
        ]
      },
      states: {
        [shouldSkip]: {
          on: {
            '': [
              { target: question, cond: 'shouldAskPingTicket' },
              { target: done }
            ]
          }
        },
        [question]: {
          onEntry: 'askPingTicket'
        },
        [done]: {},
        [skipped]: {}
      }
    },

    [itemOrdered]: {}
  }
},
{
  actions: {
    updateQuery,
    updateChat,
    updateCtxWithAnswer,
    updateCtxWithResults,
    askQuestion,
    askIntroQuestion,
    askNewTicket,
    askFindTicket,
    askPingTicket,
    skipPing
  },
  guards: {
    shouldCreateNewTicket: (ctx, event) => event.data.value === 'new_ticket',
    shouldFindTicket: (ctx, event) => event.data.value === 'find_ticket',
    shouldSendPing: (ctx, event) => event.data.value === 'ping_order',
    shouldAskPingTicket: (ctx) => !ctx.results.pinged,
    hasItems: (ctx, event) => event.data.count > 0,
    foundTicket: (ctx, event) => event.data.item,
  },
  services: {
    getPeripheral: (ctx) => getPeripheralAPI(ctx.query.peripheral),
    getTicket: (ctx) => getTicketAPI(ctx.query.ticket),
  }
});


const initialContext = {
  results: {},
  query: {},
  chat: [],
  chatErrorMsg: ''
}

export const configureMachine = () =>
flowMachine.withContext(initialContext);



