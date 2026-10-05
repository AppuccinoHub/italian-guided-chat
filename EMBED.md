# How to embed the Italian guided chat

These notes are for Claude (or anyone) adding the guided chat to another web page, such as https://appuccinohub.github.io/boh/italiano4/.

## The snippet

Paste these two lines into the page where the chat should appear:

```html
<div id="italian-guided-chat" data-level="4"></div>
<script src="https://appuccinohub.github.io/italian-guided-chat/guided-chat.js"></script>
```

That is all. Do not copy any other files into the other site. Do not build anything.

## Choosing the level

data-level picks which conversations the chat opens with. It can be 1, 2, 3, 4, or AP. For example, use data-level="AP" on the AP page. Students can still change the level in the chat's own menu.

## How it finds its files

The script loads conversations.json and vendor/peerjs.min.js from the same folder as guided-chat.js (https://appuccinohub.github.io/italian-guided-chat/), not from the page it is pasted into. So the snippet works on any page or site without changes.

Use only one chat per page. The div must have the id italian-guided-chat.

Students may type free Italian (not only the chips); English is still blocked and stays on their screen.

## Adding a conversation

Edit conversations.json in this repo (AppuccinoHub/italian-guided-chat) and push to main. GitHub Pages updates the live site in a minute or two, and every page that uses the snippet gets the new conversation. There is no rebuild.

Each conversation goes inside the "conversations" list. It needs:

- id: a short unique name with no spaces.
- level: "1", "2", "3", "4", or "AP" (in quotes).
- title: what students see.
- steps: a list. Each step has a prompt (an English instruction) and chips (the Italian phrases students can tap).

Example. Add this to the list, with a comma after the conversation before it:

```json
{
  "id": "cafe",
  "level": "2",
  "title": "At the cafe",
  "steps": [
    { "prompt": "Ask what they want.", "chips": ["Che cosa prendi?"] },
    { "prompt": "Answer.", "chips": ["Prendo un caffè.", "Prendo un cappuccino."] },
    { "prompt": "Say thank you.", "chips": ["Grazie!", "Grazie mille!"] }
  ]
}
```

If a level has more than one conversation, a Conversation menu appears so students can pick one. Check that the file is still valid JSON before you push (a missing comma breaks the whole list, and the chat will say "The conversation list did not load.").
