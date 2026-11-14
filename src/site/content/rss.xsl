<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
                version="1.0">

  <!-- Variables for theme colors -->
  <xsl:variable name="textColor">#333333</xsl:variable>
  <xsl:variable name="linkColor">#7455DD</xsl:variable>
  <xsl:variable name="backgroundColor">#1F1E33</xsl:variable>

  <!-- Entry template -->
  <xsl:template match="/">
    <html>
      <head>
        <title><xsl:value-of select="rss/channel/title"/></title>
        <style type="text/css">
          body {
            font-family: sans-serif;
            color: {$textColor};
            background-color: {$backgroundColor};
            padding: 1em;
          }
          a {
            color: #7455DD;
            text-decoration: none;
          }
          a:hover {
            text-decoration: underline;
          }
          .entry {
            margin-bottom: 2em;
            border-bottom: 1px solid #ddd;
            padding-bottom: 1em;
          }
          .entry .title {
            font-size: 1.2em;
            margin-bottom: 0.5em;
          }
          .entry .meta {
            color: #999;
            font-size: 0.9em;
          }
          .entry .description {
            margin-top: 0.5em;
          }
          .icon {
            vertical-align: middle;
            margin-right: 0.5em;
          }
          a {
            position: relative;
          }
          a::after {
            content: "";
            position: absolute;
            width: 100%;
            height: 2px;
            background: {$linkColor};
            left: 0; bottom: 0;
            transform: scaleX(0);
            transition: transform .3s ease;
          }
          a:hover::after {
            transform: scaleX(1);
          }
          @media (prefers-color-scheme: dark) {
            body {
                color: #ddd;
                background-color: #1F1E33;
            }
            a {
                color: #B9AAEE;
            }
          }
        </style>
      </head>
      <body>
        <!-- Lazy-load the Aspire logo if you have its URL -->
        <div style="display:flex; align-items:center; gap:0.5em; margin-bottom:1em;">
          <img src="/favicon.svg" alt="Aspire logo" style="height:2em;padding-right:.5rem" />
          <h1 style="margin:0;"><xsl:value-of select="rss/channel/title"/></h1>
        </div>
        <xsl:for-each select="rss/channel/item">
          <div class="entry">
            <div class="title">
              <a href="{link}">
                <xsl:value-of select="title"/>
              </a>
            </div>
            <div class="meta">
              <xsl:value-of select="pubDate"/>
            </div>
            <div class="description">
              <xsl:value-of select="description" disable-output-escaping="yes"/>
            </div>
          </div>
        </xsl:for-each>
      </body>
    </html>
  </xsl:template>

</xsl:stylesheet>
