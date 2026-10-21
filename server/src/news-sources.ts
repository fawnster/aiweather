export type FeedKind = 'rss' | 'atom' | 'json' | 'html';
export interface HtmlListing {
  rows: string;
  title: string; // '.' means the row's own text
  link?: string; // absent: row's href; '#': the published row id
  summary?: string;
  dateScope?: string;
}
export interface NewsSource {
  companyId: string;
  sourceName: string;
  sourceUrl: string;
  url?: string;
  kind?: FeedKind;
  html?: HtmlListing;
  hosts?: string[];
  discovery?: string;
  articlePath?: RegExp;
}
const feed = (companyId: string, sourceName: string, sourceUrl: string, url: string, kind: FeedKind = 'rss', hosts?: string[]): NewsSource => ({ companyId, sourceName, sourceUrl, url, kind, hosts });
const html = (companyId: string, sourceName: string, sourceUrl: string, rows: string, title: string, extra: Partial<HtmlListing> = {}): NewsSource => ({ companyId, sourceName, sourceUrl, url: sourceUrl, kind: 'html', html: { rows, title, ...extra } });
/** Manually verified official sources. See NEWS-SOURCES.md for discovery evidence. */
export const newsSources: NewsSource[] = [
  html('claude', 'Anthropic News', 'https://www.anthropic.com/news', 'article:has(> a h2), article:has(> a h3), [class*="TableView"][class*="__summary"]', 'h2,h3,[class*="__title-link"]', { link: 'a:has(h2),a:has(h3),a[class*="__title-link"]', summary: 'p[class*="Summary"],p[class*="summary"],[class*="__description"] p' }),
  feed('openai', 'OpenAI News', 'https://openai.com/news/', 'https://openai.com/news/rss.xml'),
  html('kimi', 'Kimi Research', 'https://www.kimi.ai/blog/', 'main .menu-card', '.card-title', { link: 'a[href]', summary: '.card-description' }),
  html('minimax', 'MiniMax Research', 'https://www.minimax.io/blog', 'a[href^="/blog/"]:has(h3)', 'h3', { summary: 'article' }),
  html('perplexity', 'Perplexity Blog', 'https://www.perplexity.ai/hub/blog', 'a[href*="/hub/blog/"]:has(span.text-pretty)', 'span.text-pretty:not(.text-secondary)', { summary: 'span.text-pretty.text-secondary' }),
  html('cohere', 'Cohere Blog', 'https://cohere.com/blog', 'a[href^="/blog/"]:has(p.text-web3-20)', 'p.text-web3-20'),
  html('manus', 'Manus Blog', 'https://manus.im/blog', 'a[href^="/blog/"]:has(h2),a[href^="/blog/"]:has(h3)', 'h2,h3', { summary: 'p' }),
  feed('elevenlabs', 'ElevenLabs Blog', 'https://elevenlabs.io/blog', 'https://elevenlabs.io/blog/rss.xml'),
  feed('stability', 'Stability AI News', 'https://stability.ai/news-updates', 'https://stability.ai/news-updates?format=rss'),
  html('ideogram', 'Ideogram Blog', 'https://ideogram.ai/blog/', 'a.blog-card', '.blog-card-title', { summary: '.blog-card-excerpt' }),
  { companyId: 'runway', sourceName: 'Runway News', sourceUrl: 'https://runway.com/news', discovery: 'News listing is a client-rendered shell; no advertised feed; /news/rss.xml is 404.' },
  html('heygen', 'HeyGen Blog', 'https://www.heygen.com/blog', 'a[href^="/blog/"]:has(h3)', 'h3'),
  html('gamma', 'Gamma Blog', 'https://gamma.app/blog', 'article', 'h2,h3', { link: 'a[href]' }),
  html('cartesia', 'Cartesia Blog', 'https://www.cartesia.ai/blog', 'a[href^="/blog/"]:has(time)', 'h2,h3,[class*="font-display"]'),
  html('groq', 'Groq Blog', 'https://groq.com/blog', 'a[href^="/blog/"]:has(h2)', 'h2'),
  html('cerebras', 'Cerebras Blog', 'https://www.cerebras.ai/blog', 'a[href^="/blog/"]:has(h2),a[href^="/blog/"]:has(h3)', 'h2,h3'),
  html('fireworks', 'Fireworks Blog', 'https://fireworks.ai/blog', 'a[href^="/blog/"]:has(h3)', 'h3'),
  feed('lambda', 'Lambda Blog', 'https://lambda.ai/blog', 'https://lambda.ai/blog/rss.xml'),
  feed('openrouter', 'OpenRouter Blog', 'https://openrouter.ai/blog/', 'https://openrouter.ai/blog/feed.xml'),
  html('poe', 'Poe Blog', 'https://poe.com/blog', 'article', 'h2,h3', { link: 'a[href]' }),
  html('cursor', 'Cursor Blog', 'https://cursor.com/blog', 'main a[href^="/blog/"]:has(time)', 'p.text-theme-text', { summary: 'p.text-theme-text-sec' }),
  feed('copilot', 'GitHub Copilot Changelog', 'https://github.blog/changelog/label/copilot/', 'https://github.blog/changelog/label/copilot/feed/'),
  feed('windsurf', 'Devin Desktop Changelog (formerly Windsurf)', 'https://docs.devin.ai/desktop/changelog', 'https://docs.devin.ai/desktop/changelog/rss.xml'),
  feed('amp', 'Amp News', 'https://ampcode.com/chronicle', 'https://ampcode.com/news.rss'),
  feed('factory', 'Factory News', 'https://factory.com/news', 'https://factory.com/news/rss'),
  html('devin', 'Cognition Blog', 'https://cognition.com/blog', 'a[href^="/blog/"]:has(h2),a[href^="/blog/"]:has(h3)', 'h2,h3', { summary: 'p' }),
  feed('lovable', 'Lovable Blog', 'https://lovable.dev/blog', 'https://lovable.dev/blog/rss.xml'),
  html('bolt', 'Bolt Blog', 'https://bolt.new/blog', 'a:has(.blog-hero-title),a.blog-list-item', '.blog-hero-title,.blog-list-title', { summary: '.blog-hero-excerpt,.blog-list-excerpt' }),
  html('v0', 'v0 Changelog', 'https://v0.app/changelog', 'main article[id]', 'header h2', { link: '#' }),
  feed('zed', 'Zed Blog', 'https://zed.dev/blog', 'https://zed.dev/blog.rss'),
  html('synteq', 'Synteq Blog', 'https://synteq.com/blogs', 'a[href^="/blogs/"]:has(h3)', 'h3', { summary: 'p' }),
  html('grok', 'xAI News', 'https://x.ai/news', 'article', 'h2,h3', { link: 'a[href]' }),
  html('deepseek', 'DeepSeek API News', 'https://api-docs.deepseek.com/news/news261017/', '.menu__list a[href^="/news/"]', '.'),
  feed('qwen', 'Qwen Blog', 'https://qwenlm.github.io/blog/', 'https://qwenlm.github.io/blog/index.xml'),
  feed('together', 'Together AI Blog', 'https://www.together.ai/blog', 'https://www.together.ai/blog/rss.xml'),
  { ...feed('huggingface', 'Hugging Face Blog', 'https://huggingface.co/blog', 'https://huggingface.co/blog/feed.xml'), articlePath: /^\/blog\/(?:huggingface\/)?[^/]+\/?$/ },
  html('luma', 'Luma News', 'https://lumalabs.ai/news', 'div.group:has(> div > h3 > a.card-link)', 'a.card-link', { link: 'a.card-link' }),
  feed('novita', 'Novita AI Blog', 'https://blogs.novita.ai/', 'https://blogs.novita.ai/rss.xml', 'rss', ['blogs.novita.ai', 'novita.ai']),
  feed('modal', 'Modal Blog', 'https://modal.com/blog', 'https://modal.com/blog/atom.xml', 'atom'),
  html('udio', 'Udio Blog', 'https://www.udio.com/blog', '.featured-article,.article', 'h3.article-title', { link: 'a:has(h3.article-title)', summary: 'p.article-excerpt' }),
  feed('higgsfield', 'Higgsfield Blog', 'https://higgsfield.ai/blog', 'https://higgsfield.ai/blog/rss.xml'),
  html('ai21', 'AI21 Labs Blog', 'https://www.ai21.com/blog/', '.card-post', '.post__title', { link: 'a.post__main', summary: '.post__description' }),
  feed('augment', 'Augment Code Blog', 'https://www.augmentcode.com/blog', 'https://www.augmentcode.com/blog/rss.xml', 'rss', ['www.augmentcode.com', 'augmentcode.com']),
  feed('warp', 'Warp Blog', 'https://www.warp.dev/blog', 'https://www.warp.dev/blog/feed.xml'),
  feed('baseten', 'Baseten Changelog', 'https://www.baseten.co/changelog/', 'https://www.baseten.co/feeds/changelog.xml'),
  html('tavus', 'Tavus Blog', 'https://www.tavus.io/blog', 'a.blog-box', '.blog-title p.heading-five', { summary: 'p.text-style-4lines' }),
  html('assemblyai', 'AssemblyAI Changelog', 'https://www.assemblyai.com/changelog', 'article.changelog-entry[id]', 'h2 > a', { link: '#', summary: '.changelog-summary-line' }),
  feed('gemini', 'Google Gemini blog', 'https://blog.google/products-and-platforms/products/gemini/', 'https://blog.google/products-and-platforms/products/gemini/rss/'),
];
