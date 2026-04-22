# Internal reference variants

Obsidian and similar tools resolve internal references in multiple ways.

## Standard wikilinks

- [[Target]]
- [[Target|Display]]
- [[Target#Heading]]
- [[Target#Heading|Display]]
- [[Target^blockid]]
- [[Target^blockid|Display]]

## Same-page anchors (self-reference)

- [[#Heading on this page]]
- [[#Heading on this page|Display]]
- [[#^blockid-on-this-page]]

## Embed variants

- ![[Target]]
- ![[Target#Heading]]
- ![[Target^blockid]]
- ![[image.png]]
- ![[diagram.svg|400]] — sized embed
- ![[video.mp4]]

## External URLs

- [Regular markdown link](https://example.com)
- [Link with title](https://example.com "Title text")
- <https://auto-link-example.com>
- https://raw-url-not-linked.com

## Reference-style links

See [the reference][ref1] and [also this][ref2].

[ref1]: https://example.com/first "First reference"
[ref2]: https://example.com/second "Second reference"

## Footnotes

Here is a footnote reference[^1] and another[^named].

[^1]: This is the first footnote.

[^named]: This is a named footnote.
