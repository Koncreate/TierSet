# Social Sharing with react-share

TierBoard uses [react-share](https://github.com/nygardk/react-share) for social media sharing functionality.

## Installation

Already included in the project:

```bash
bun add react-share
```

## Available Features

### Share Buttons

Support for 30+ social platforms including:

- Facebook, Twitter (X), LinkedIn, Reddit
- WhatsApp, Telegram, Line, Viber, Weibo
- Pinterest, Tumblr, Pocket, Instapaper
- Email, Facebook Messenger, Workplace
- Threads, Bluesky, Gab, Hatena

### Share Counts

Real-time share counts for:

- Facebook, Pinterest, Reddit
- Tumblr, VK, Odnoklassniki
- Hatena

### Social Icons

Built-in SVG icons for all platforms with customizable:

- Size (16-128px)
- Round/rectangular shapes
- Colors and styles

## Usage Examples

### Basic Share Button

```tsx
import { FacebookShareButton, FacebookIcon } from "react-share";

<FacebookShareButton
  url={"https://tierboard.example.com/my-tierlist"}
  quote={"Check out my awesome tier list!"}
  hashtag="#tierlist"
>
  <FacebookIcon size={32} round />
  <span className="ml-2">Share</span>
</FacebookShareButton>;
```

### Twitter Share with Hashtags

```tsx
import { TwitterShareButton, TwitterIcon } from "react-share";

<TwitterShareButton
  url={"https://tierboard.example.com/my-tierlist"}
  title={"My Mario Characters Tier List"}
  hashtags={["tierlist", "mario", "gaming"]}
>
  <TwitterIcon size={32} round />
</TwitterShareButton>;
```

### Share Count Display

```tsx
import { FacebookShareCount } from "react-share";

<FacebookShareCount
  url={"https://tierboard.example.com/my-tierlist"}
  className="text-sm text-gray-500 ml-2"
>
  {(shareCount) => <span>{shareCount} shares</span>}
</FacebookShareCount>;
```

### Multiple Platforms

```tsx
import {
  FacebookShareButton,
  TwitterShareButton,
  RedditShareButton,
  FacebookIcon,
  TwitterIcon,
  RedditIcon,
} from "react-share";

const shareUrl = "https://tierboard.example.com/my-tierlist";
const title = "My Awesome Tier List";

<div className="flex space-x-2">
  <FacebookShareButton url={shareUrl} quote={title}>
    <FacebookIcon size={40} round />
  </FacebookShareButton>

  <TwitterShareButton url={shareUrl} title={title}>
    <TwitterIcon size={40} round />
  </TwitterShareButton>

  <RedditShareButton url={shareUrl} title={title}>
    <RedditIcon size={40} round />
  </RedditShareButton>
</div>;
```

## Integration Points

### Tier List Sharing

Add share buttons to tier list pages to allow users to share their creations:

- `src/components/tier-list/TierList.tsx`
- `src/routes/board/$boardId.tsx`

### Board Sharing

Add sharing functionality to board views:

- `src/components/board/BoardView.tsx`

### Result Sharing

Allow sharing of tier list results:

- `src/components/results/ResultsView.tsx`

## Advanced Configuration

### Custom Window Dimensions

```tsx
<FacebookShareButton
  url={shareUrl}
  windowWidth={600}
  windowHeight={400}
  // ...
>
```

### Disabled State

```tsx
<FacebookShareButton
  url={shareUrl}
  disabled={!isPublished}
  disabledStyle={{ opacity: 0.6 }}
  // ...
>
```

### Custom Icons

```tsx
<FacebookShareButton url={shareUrl}>
  <div className="flex items-center p-2 bg-blue-600 text-white rounded">
    <FacebookIcon size={20} iconFillColor="white" />
    <span className="ml-2">Share on Facebook</span>
  </div>
</FacebookShareButton>
```

## Performance Considerations

- **Bundle Size**: ~10KB (minified + gzipped)
- **Dependencies**: Only `classnames` and `jsonp`
- **Tree Shaking**: Full ES modules support
- **Lazy Loading**: Can be dynamically imported

## TypeScript Support

Full TypeScript definitions included. Import types as needed:

```tsx
import type { ShareButtonProps } from "react-share";
```

## Resources

- [Official Documentation](https://github.com/nygardk/react-share)
- [Live Demo](https://npm-react-share-demo.netlify.app)
- [Codesandbox Example](https://codesandbox.io/p/sandbox/react-share-demo-474q4k)
- [API Reference](https://github.com/nygardk/react-share#api)
