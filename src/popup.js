import { OPENAI_KEY, CLAIMBUSTER_KEY } from "./config.js";

async function checkClaim(articleContent) {
  try {
    if (!articleContent) {
      throw new Error('No article content found');
    }

    // Setup the request
    const response = await fetch(`https://idir.uta.edu/claimbuster/api/v2/score/text/sentences/${articleContent}`, {
      method: 'GET',
      headers: {
        'x-api-key': CLAIMBUSTER_KEY,
      }
    });

    if (!response.ok) {
      throw new Error(`ClaimBuster API error: ${response.status}`);
    }

    const data = await response.json();
    console.log('ClaimBuster response:', data);
    console.log(data.results[0].text);
    return data;

  } catch (error) {
    console.error('Error in checkClaim:', error);
    throw error;
  }
}

// Function to extract article content
function extractArticleContent() {
  try {
    console.log('Starting content extraction in page context');
    
    if (!document || !document.body) {
      console.error('No document or body found');
      return null;
    }

    // Try to find the main article content using common selectors
    const articleSelectors = [
      'article',
      '[role="article"]',
      '.article-body',
      '.article-content',
      '.story-body',
      '.story-content',
      '.post-content',
      '.entry-content',
      '.main-content',
      'main',
      '#article-body',
      '#story-body',
      '.article__body',
      '.article-text',
      '.story-text'
    ];

    let mainContent = null;
    for (const selector of articleSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        mainContent = element;
        console.log(`Found main content using selector: ${selector}`);
        break;
      }
    }

    if (!mainContent) {
      console.log('No specific article container found, attempting fallback methods');
      // Fallback: Look for the largest text container
      const paragraphs = Array.from(document.getElementsByTagName('p'));
      if (paragraphs.length > 0) {
        // Find the paragraph's common ancestor with the most paragraphs
        const ancestors = new Map();
        paragraphs.forEach(p => {
          let ancestor = p.parentElement;
          while (ancestor && ancestor !== document.body) {
            ancestors.set(ancestor, (ancestors.get(ancestor) || 0) + 1);
            ancestor = ancestor.parentElement;
          }
        });
        
        // Get the ancestor with the most paragraphs
        mainContent = Array.from(ancestors.entries())
          .reduce((a, b) => a[1] > b[1] ? a : b)[0];
      }
    }

    if (!mainContent) {
      console.error('Could not find article content');
      return null;
    }

    // Clone the content
    const contentClone = mainContent.cloneNode(true);

    // Remove all script and style elements
    const elementsToRemove = contentClone.querySelectorAll('script, style, noscript, iframe, img, video, audio, picture, svg, canvas, form, input, button, [role="button"], [role="complementary"], [role="banner"], [role="navigation"], .ad, .advertisement, .social-share, .newsletter, .related-articles, .recommended, .comments, .sidebar, aside, nav, footer, header');
    elementsToRemove.forEach(el => el.remove());

    // Clean up text content
    const paragraphs = Array.from(contentClone.getElementsByTagName('p'))
      .filter(p => {
        const text = p.textContent.trim();
        // Filter out short or likely non-article paragraphs
        if (text.length < 20) return false;
        // Filter out common non-article text patterns
        const nonArticlePatterns = [
          /^share$/i,
          /^subscribe$/i,
          /^follow us$/i,
          /^read more$/i,
          /^comments$/i,
          /^\d+ (min|minute) read$/i,
          /^published/i,
          /^updated/i
        ];
        return !nonArticlePatterns.some(pattern => pattern.test(text));
    });

    // Get the article title
    const titleSelectors = [
      'h1',
      '.article-title',
      '.entry-title',
      '.post-title',
      '[itemprop="headline"]'
    ];
    
    let title = null;
    for (const selector of titleSelectors) {
      const titleElement = document.querySelector(selector);
      if (titleElement) {
        title = titleElement.textContent.trim();
        break;
      }
    }
    
    if (!title) {
      title = document.title.split('|')[0].trim();
    }

    // Combine paragraphs into clean content
    const cleanContent = paragraphs
      .map(p => p.textContent.trim())
      .filter(text => text.length > 0)
      .join('\n\n');

    return {
      title: title,
      content: cleanContent,
      excerpt: cleanContent.substring(0, 200),
      byline: document.querySelector('.byline, .author, [rel="author"]')?.textContent?.trim() || '',
      siteName: document.querySelector('meta[property="og:site_name"]')?.content || window.location.hostname
    };

  } catch (error) {
    console.error('Error in content extraction:', error);
    return null;
  }
}

// Wait for DOM to be loaded before setting up event listeners
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM Content Loaded');
  
  const extractButton = document.getElementById('extract-btn');
  console.log('Extract button found:', !!extractButton);
  
  if (!extractButton) {
    console.error('Extract button not found in DOM');
    return;
  }

  extractButton.addEventListener('click', async () => {
    try {
      console.log('Extract button clicked');
      
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
      console.log('Current tab:', {
        id: tab.id,
        url: tab.url
      });
      
      const results = await chrome.scripting.executeScript({
        target: {tabId: tab.id},
        function: extractArticleContent,
        // Add this to ensure we have access to the page's DOM
        world: "MAIN"
      });
      console.log('Script execution results:', results);

      const articleData = results[0].result;
      console.log('Extracted article data:', {
        hasData: !!articleData,
        title: articleData?.title,
        contentLength: articleData?.content?.length
      });
      
      const contentDiv = document.getElementById('article-content');
      
      if (articleData) {
        console.log('Rendering article content');
        contentDiv.innerHTML = `
          <h2>${articleData.title || ''}</h2>
          ${articleData.byline ? `<p><em>${articleData.byline}</em></p>` : ''}
          ${articleData.content || 'No content found'}
        `;
      } else {
        console.log('No article data to render');
        contentDiv.textContent = 'Could not extract article content';
      }
    } catch (error) {
      console.error('Error in click handler:', error);
      document.getElementById('article-content').textContent = 'Error extracting article content';
    }
  });
});

  // Function to get a summary from OpenAI API
  async function getSummaryFromOpenAI(text) {
    const prompt = `
      Analyze this article thoroughly and extract the 5 most significant claims or statements. For each claim:
      1. Focus on factual assertions, key statistics, and major conclusions
      2. Prioritize claims that are specific, verifiable, and impactful
      3. Include relevant context and details that support the claim
      4. Capture any quantitative data, expert opinions, or research findings
      5. Maintain the original meaning and nuance of each claim

      Format each claim as a single, clear sentence that captures the complete context.
      Combine all claims into a single paragraph without enumeration.

      Example output format:
      The study found that 87% of climate scientists agree with the consensus on global warming. New satellite data reveals Arctic ice has decreased by 13% over the past decade. Research from Stanford University demonstrates a direct link between air pollution and respiratory diseases in urban areas. The government's economic report indicates a 3.2% growth in GDP during the last quarter. Multiple independent studies confirm that regular exercise reduces heart disease risk by up to 40% in adults over 50.
    `
  
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini', 
          messages: [
            {
              role: "system",
              content: "You are a precise fact-checking assistant that extracts detailed, verifiable claims from articles while preserving important context and supporting details."
            },
            {
              role: "user",
              content: prompt
            },
            {
              role: "user",
              content: text
            }
          ],
          max_completion_tokens: 200, // Increased token limit for more detailed responses
        }),
      });

      const data = await response.json();
      console.log("OpenAI Response:", data);
      return data;
    } catch (error) {
      console.error('Error summarizing with OpenAI:', error);
      return 'Error summarizing content';
    }
  }



  // Button trigger to output
document.addEventListener('DOMContentLoaded', function () {
    const summarizeButton = document.getElementById('summarize-btn');
  
    // Check if the button exists
    if (summarizeButton) {
      summarizeButton.addEventListener('click', async () => {
        try {
          console.log('Summarizing content...');
          const articleContent = await extractArticleContent();
          console.log(articleContent);
          const summarizeContent = await getSummaryFromOpenAI(articleContent.content);

          console.log(summarizeContent);
          let summaryText = summarizeContent.choices[0].message.content;
          
          // Output the summarized content
          const resultDiv = document.getElementById('result-content');
          resultDiv.textContent = summaryText ? summaryText : "Error summarizing content";
          
        } catch (error) {
          console.error('Error during summarization:', error);
        }
      });
    }
  });


  document.addEventListener('DOMContentLoaded', function () {
    const startFlowButton = document.getElementById('main-btn');
    console.log('Main start button found:', !!startFlowButton);
    
    if (!startFlowButton) {
      console.error('START button not found in DOM');
      return;
    }
  
    startFlowButton.addEventListener('click', async () => {
      try {
        console.log('Extract button clicked');
        
        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
        console.log('Current tab:', {
          id: tab.id,
          url: tab.url
        });
        
        const results = await chrome.scripting.executeScript({
          target: {tabId: tab.id},
          function: extractArticleContent,
          // Add this to ensure we have access to the page's DOM
          world: "MAIN"
        });
        console.log('Script execution results:', results);
  
        const articleData = results[0].result;
        console.log('Extracted article data:', {
          hasData: !!articleData,
          title: articleData?.title,
          contentLength: articleData?.content?.length
        });
        
        const contentDiv = document.getElementById('article-content');
        
        if (articleData) {
          console.log('Rendering article content');
          contentDiv.innerHTML = `
            <h2>${articleData.title || ''}</h2>
            ${articleData.byline ? `<p><em>${articleData.byline}</em></p>` : ''}
            ${articleData.content || 'No content found'}
          `;
        } else {
          console.log('No article data to render');
          contentDiv.textContent = 'Could not extract article content';
        }
 

        console.log('Summarizing content...');
        console.log(articleData.content);
        const summarizeContent = await getSummaryFromOpenAI(articleData.content);

        console.log(summarizeContent);
        let summaryText = summarizeContent.choices[0].message.content;
        console.log("HERE HERER HEREREHERE", summaryText);
        
        //DATA OBJECT THAT IS RETURNED FROM FACT CHECKING API, ADD LOGIC AFTER THIS LINE
        const data = checkClaim(summaryText);
        ///
        const score = averageRoundedScore(data);
        const metric = metricSystem(score);


        console.log(metric);
        console.log(score);

        const finalOutput = document.getElementById('final-output');

        // Get fact check results
        const claimBusterResult = await checkClaim(summaryText);
        
        // Sort claims by their score and convert to percentage
        const sortedClaims = claimBusterResult.results
          .sort((a, b) => b.score - a.score)
          .map((claim, index) => ({
            ...claim,
            formattedScore: Math.round(claim.score * 100) + '%'
          }));

        // Create the results display
        const resultsHTML = `
          <div style="margin-top: 20px; padding: 15px; border-radius: 8px; background-color: ${metric.color}15;">
            <div style="display: flex; align-items: center; margin-bottom: 15px;">
              <div style="width: 24px; height: 24px; border-radius: 50%; background-color: ${metric.color}; margin-right: 12px;"></div>
              <h4 style="margin: 0; font-size: 1.2rem; font-weight: 700;">${metric.text}</h4>
            </div>

            <div style="background-color: white; padding: 12px; border-radius: 6px; border: 1px solid ${metric.color}40; margin-bottom: 15px;">
              <div style="font-size: 1.1rem; font-weight: 500; margin-bottom: 5px;">Overall Score: ${score}/5</div>
              <div style="font-size: 0.9rem; color: #666;">Based on analysis of ${claimBusterResult.results.length} claims</div>
            </div>

            <div style="background-color: white; padding: 12px; border-radius: 6px; border: 1px solid ${metric.color}40; margin-bottom: 15px;">
              <div style="font-weight: 500; margin-bottom: 10px;">Analyzed Claims:</div>
              <div style="max-height: 200px; overflow-y: auto;">
                ${sortedClaims.map((claim, index) => `
                  <div style="padding: 8px; margin-bottom: 8px; background-color: #f8f9fa; border-radius: 4px; border-left: 3px solid ${getScoreColor(claim.score)};">
                    <div style="font-size: 0.9rem; margin-bottom: 4px;">${index + 1}. ${claim.text}</div>
                    <div style="font-size: 0.8rem; color: #666; display: flex; align-items: center;">
                      <span style="width: 8px; height: 8px; border-radius: 50%; background-color: ${getScoreColor(claim.score)}; margin-right: 6px;"></span>
                      Score: ${claim.formattedScore}
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>

            <div style="background-color: white; padding: 12px; border-radius: 6px; border: 1px solid ${metric.color}40;">
              <div style="font-weight: 500; margin-bottom: 10px;">Article Summary:</div>
              <div style="font-size: 0.9rem; line-height: 1.5; max-height: 150px; overflow-y: auto;">
                ${summaryText}
              </div>
            </div>
          </div>
        `;
        
        finalOutput.innerHTML = resultsHTML;

      } catch (error) {
        console.error('Error:', error);
      }

      
    
    });

  })
  
  async function averageRoundedScore(resultObject) {
    try {
      if (!resultObject || !resultObject.results || resultObject.results.length === 0) {
        throw new Error('Invalid result object');
      }

      const total = resultObject.results.reduce((sum, result) => sum + result.score, 0);
      const average = total / resultObject.results.length;
      
      // Convert to 1-5 scale
      if (average <= 0.2) return 1;
      if (average <= 0.4) return 2;
      if (average <= 0.6) return 3;
      if (average <= 0.8) return 4;
      return 5;
    } catch (error) {
      console.error('Error calculating score:', error);
      return null;
    }
  }

  function metricSystem(value) {
    const metrics = {
      1: { text: "Not Credible", color: "#FF4444" },
      2: { text: "Not Very Credible", color: "#FFA500" },
      3: { text: "Somewhat Credible", color: "#FFD700" },
      4: { text: "Probably Credible", color: "#90EE90" },
      5: { text: "Credible", color: "#4CAF50" }
    };
    
    return metrics[value] || { text: "Unable to determine credibility", color: "#808080" };
  }

  async function performFactCheck() {
    try {
      const resultDiv = document.getElementById('result-content');
      const finalOutput = document.getElementById('final-output');
      
      if (!resultDiv || !resultDiv.textContent) {
        throw new Error('No content to fact check');
      }

      // Show loading state
      finalOutput.innerHTML = '<div class="loading">Checking facts...</div>';

      // Get the claims from the summary
      const summaryText = resultDiv.textContent;
      
      // Check claims using ClaimBuster
      const claimBusterResult = await checkClaim(summaryText);
      
      // Calculate the credibility score
      const score = await averageRoundedScore(claimBusterResult);
      const metric = metricSystem(score);

      // Sort claims by their score and convert to percentage
      const sortedClaims = claimBusterResult.results
        .sort((a, b) => b.score - a.score)
        .map((claim, index) => ({
          ...claim,
          formattedScore: Math.round(claim.score * 100) + '%'
        }));
      
      // Create the results display
      const resultsHTML = `
        <div style="margin-top: 20px; padding: 15px; border-radius: 8px; background-color: ${metric.color}15;">
          <div style="display: flex; align-items: center; margin-bottom: 15px;">
            <div style="
              width: 24px;
              height: 24px;
              border-radius: 50%;
              background-color: ${metric.color};
              margin-right: 12px;">
            </div>
            <h4 style="margin: 0; font-size: 1.2rem; font-weight: 700;">${metric.text}</h4>
          </div>

          <div style="
            background-color: white;
            padding: 12px;
            border-radius: 6px;
            border: 1px solid ${metric.color}40;
            margin-bottom: 15px;">
            <div style="font-size: 1.1rem; font-weight: 500; margin-bottom: 5px;">
              Overall Score: ${score}/5
            </div>
            <div style="font-size: 0.9rem; color: #666;">
              Based on analysis of ${claimBusterResult.results.length} claims
            </div>
          </div>

          <div style="
            background-color: white;
            padding: 12px;
            border-radius: 6px;
            border: 1px solid ${metric.color}40;">
            <div style="font-weight: 500; margin-bottom: 10px;">Analyzed Claims:</div>
            <div style="max-height: 200px; overflow-y: auto;">
              ${sortedClaims.map((claim, index) => `
                <div style="
                  padding: 8px;
                  margin-bottom: 8px;
                  background-color: #f8f9fa;
                  border-radius: 4px;
                  border-left: 3px solid ${getScoreColor(claim.score)};
                ">
                  <div style="font-size: 0.9rem; margin-bottom: 4px;">
                    ${index + 1}. ${claim.text}
                  </div>
                  <div style="
                    font-size: 0.8rem;
                    color: #666;
                    display: flex;
                    align-items: center;
                  ">
                    <span style="
                      width: 8px;
                      height: 8px;
                      border-radius: 50%;
                      background-color: ${getScoreColor(claim.score)};
                      margin-right: 6px;
                    "></span>
                    Score: ${claim.formattedScore}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `;
      
      finalOutput.innerHTML = resultsHTML;
      
    } catch (error) {
      console.error('Error in fact checking:', error);
      finalOutput.innerHTML = `
        <div style="color: #FF4444; padding: 10px;">
          Error performing fact check: ${error.message}
        </div>
      `;
    }
  }

  // Helper function to get color based on individual claim score
  function getScoreColor(score) {
    if (score >= 0.8) return "#4CAF50";  // High credibility
    if (score >= 0.6) return "#90EE90";  // Probably credible
    if (score >= 0.4) return "#FFD700";  // Somewhat credible
    if (score >= 0.2) return "#FFA500";  // Not very credible
    return "#FF4444";                    // Not credible
  }

  // Add event listener for the fact check button
  document.addEventListener('DOMContentLoaded', function() {
    const factCheckButton = document.createElement('button');
    factCheckButton.id = 'fact-check-btn';
    factCheckButton.textContent = 'Fact Check';
    
    // Add the button to the button group
    const buttonGroup = document.querySelector('.button-group');
    if (buttonGroup) {
      buttonGroup.appendChild(factCheckButton);
    }
    
    // Add click handler
    factCheckButton.addEventListener('click', performFactCheck);
  });

// Remove the old button event listeners and create new ones
document.addEventListener('DOMContentLoaded', function() {
  const buttonGroup = document.querySelector('.button-group');
  if (!buttonGroup) return;

  // Clear existing buttons
  buttonGroup.innerHTML = '';

  // Create the reformat button
  const reformatButton = document.createElement('button');
  reformatButton.id = 'reformat-btn';
  reformatButton.textContent = 'Reformat Article';
  reformatButton.className = 'primary-button';
  reformatButton.style.marginBottom = '10px'; // Add spacing between buttons
  buttonGroup.appendChild(reformatButton);

  // Create the analyze button
  const analyzeButton = document.createElement('button');
  analyzeButton.id = 'analyze-btn';
  analyzeButton.textContent = 'Fact Check + Summary';
  analyzeButton.className = 'primary-button';
  buttonGroup.appendChild(analyzeButton);

  // Add click handler for reformat button
  reformatButton.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
      
      // Show loading state
      const finalOutput = document.getElementById('final-output');
      finalOutput.innerHTML = `
        <div style="text-align: center; margin-top: 15px;">
          <div style="color: #666; margin-bottom: 10px;">Reformatting article...</div>
          <div class="progress-bar">
            <div class="progress-bar-fill"></div>
          </div>
        </div>
      `;

      // Execute the cleanup
      await chrome.scripting.executeScript({
        target: {tabId: tab.id},
        function: cleanPageContent,
        world: "MAIN"
      });

      window.close();
    } catch (error) {
      console.error('Error reformatting:', error);
      document.getElementById('final-output').innerHTML = `
        <div style="text-align: center; color: #FF4444;">
          Error reformatting article
        </div>
      `;
      window.close();
    }
  });

  // Keep existing analyze button click handler
  analyzeButton.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
      
      // Show loading state
      const finalOutput = document.getElementById('final-output');
      finalOutput.innerHTML = `
        <div style="text-align: center; margin-top: 15px;">
          <div style="color: #666; margin-bottom: 10px;">Analyzing article...</div>
          <div class="progress-bar">
            <div class="progress-bar-fill"></div>
          </div>
        </div>
      `;

      // Continue with existing analysis code without the cleanup...
      const results = await chrome.scripting.executeScript({
        target: {tabId: tab.id},
        function: extractArticleContent,
        world: "MAIN"
      });

      const articleData = results[0].result;
      if (!articleData) {
        throw new Error('Could not extract article content');
      }

      const summarizeContent = await getSummaryFromOpenAI(articleData.content);
      const summaryText = summarizeContent.choices[0].message.content;
      const claimBusterResult = await checkClaim(summaryText);
      const score = await averageRoundedScore(claimBusterResult);
      const metric = metricSystem(score);
      const sortedClaims = claimBusterResult.results
        .sort((a, b) => b.score - a.score)
        .map(claim => ({
          ...claim,
          formattedScore: Math.round(claim.score * 100) + '%'
        }));

      // Create and inject the floating panel
      await chrome.scripting.executeScript({
        target: {tabId: tab.id},
        func: (metric, score, sortedClaims, summaryText) => {
          // Remove any existing panel
          const existingPanel = document.getElementById('verify-ai-results-panel');
          if (existingPanel) existingPanel.remove();

          // Helper function for getting score colors
          function getScoreColor(score) {
            if (score >= 0.8) return "#4CAF50";  // High credibility
            if (score >= 0.6) return "#90EE90";  // Probably credible
            if (score >= 0.4) return "#FFD700";  // Somewhat credible
            if (score >= 0.2) return "#FFA500";  // Not very credible
            return "#FF4444";                    // Not credible
          }

          // Create the panel
          const panel = document.createElement('div');
          panel.id = 'verify-ai-results-panel';
          panel.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            width: 400px;
            max-height: 90vh;
            background: white;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
            z-index: 999999;
            overflow-y: auto;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            animation: slideInPanel 0.3s ease-out;
          `;

          // Update the content sections to handle scrolling better
          panel.innerHTML = `
            <div style="padding: 15px; background-color: ${metric.color}15; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <div style="display: flex; align-items: center;">
                  <div style="width: 24px; height: 24px; border-radius: 50%; background-color: ${metric.color}; margin-right: 12px;"></div>
                  <h4 style="margin: 0; font-size: 1.2rem; font-weight: 700; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">${metric.text}</h4>
                </div>
                <button id="verify-ai-close-button" style="
                  background: none;
                  border: none;
                  cursor: pointer;
                  padding: 5px;
                  font-size: 18px;
                  color: #666;
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                ">×</button>
              </div>

              <div style="background-color: white; padding: 12px; border-radius: 6px; border: 1px solid ${metric.color}40; margin-bottom: 15px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                <div style="font-size: 1.1rem; font-weight: 500; margin-bottom: 5px;">Overall Score: ${score}/5</div>
                <div style="font-size: 0.9rem; color: #666;">Based on analysis of ${sortedClaims.length} claims</div>
              </div>

              <div style="background-color: white; padding: 12px; border-radius: 6px; border: 1px solid ${metric.color}40; margin-bottom: 15px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                <div style="font-weight: 500; margin-bottom: 10px;">Analyzed Claims:</div>
                <div style="max-height: 300px; overflow-y: auto;">
                  ${sortedClaims.map((claim, index) => `
                    <div style="padding: 8px; margin-bottom: 8px; background-color: #f8f9fa; border-radius: 4px; border-left: 3px solid ${getScoreColor(claim.score)}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                      <div style="font-size: 0.9rem; margin-bottom: 4px;">${index + 1}. ${claim.text}</div>
                      <div style="font-size: 0.8rem; color: #666; display: flex; align-items: center;">
                        <span style="width: 8px; height: 8px; border-radius: 50%; background-color: ${getScoreColor(claim.score)}; margin-right: 6px;"></span>
                        Score: ${claim.formattedScore}
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>

              <div style="background-color: white; padding: 12px; border-radius: 6px; border: 1px solid ${metric.color}40; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                <div style="font-weight: 500; margin-bottom: 10px;">Article Summary:</div>
                <div style="font-size: 0.9rem; line-height: 1.5;">
                  ${summaryText}
                </div>
              </div>
            </div>
          `;

          // Add styles for better scrolling
          const style = document.createElement('style');
          style.textContent = `
            @keyframes slideInPanel {
              from { transform: translateX(100%); opacity: 0; }
              to { transform: translateX(0); opacity: 1; }
            }
            #verify-ai-results-panel::-webkit-scrollbar {
              width: 8px;
            }
            #verify-ai-results-panel::-webkit-scrollbar-track {
              background: #f1f1f1;
              border-radius: 4px;
            }
            #verify-ai-results-panel::-webkit-scrollbar-thumb {
              background: #888;
              border-radius: 4px;
            }
            #verify-ai-results-panel::-webkit-scrollbar-thumb:hover {
              background: #666;
            }
          `;
          document.head.appendChild(style);

          // Add close button functionality
          panel.querySelector('#verify-ai-close-button').addEventListener('click', () => {
            panel.remove();
          });

          document.body.appendChild(panel);
        },
        args: [metric, score, sortedClaims, summaryText]
      });

      // Close the popup window immediately
      window.close();
          
        } catch (error) {
      console.error('Error in analysis:', error);
      document.getElementById('final-output').innerHTML = `
        <div style="text-align: center; color: #FF4444;">
          Error analyzing article
        </div>
      `;
      // Close popup immediately even if there's an error
      window.close();
    }
  });
});

// Add this function to handle content cleanup
function cleanPageContent() {
  // Elements to remove (common ad and unnecessary content selectors)
  const removeSelectors = [
    // Ads
    '[class*="ad-"]', '[class*="ads-"]', '[id*="ad-"]', '[id*="ads-"]',
    'ins.adsbygoogle', '.advertisement', '[class*="sponsor"]',
    
    // Social media & sharing
    '.social-share', '.share-buttons', '.social-media',
    
    // Popups & overlays
    '.popup', '.modal', '.overlay', '.newsletter-signup',
    
    // Sidebars & non-essential content
    '.sidebar:not(.article-sidebar)', 'aside:not(.article-aside)',
    '.related-articles', '.recommended', '.trending',
    
    // Comments
    '#comments', '.comments-section', '.disqus_thread',
    
    // Newsletter & subscription
    '.newsletter', '.subscribe', '.subscription',
    
    // Cookie notices & banners
    '.cookie-notice', '.cookie-banner', '.gdpr',
    
    // Other distractions
    '.outbrain', '.taboola', '[class*="sponsored"]',
    '.promoted', '.partner-content'
  ];

  // Find the main article container first
  const articleSelectors = [
    'article',
    '[role="article"]',
    '.article-body',
    '.article-content',
    '.story-body',
    '.post-content',
    'main',
    '#article-body'
  ];

  let mainArticle = null;
  for (const selector of articleSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      mainArticle = element;
      break;
    }
  }

  if (mainArticle) {
    // Store the original styles of the main article
    const computedStyle = window.getComputedStyle(mainArticle);
    const originalStyles = {
      width: computedStyle.width,
      margin: computedStyle.margin,
      padding: computedStyle.padding,
      fontSize: computedStyle.fontSize,
      lineHeight: computedStyle.lineHeight,
      fontFamily: computedStyle.fontFamily,
      color: computedStyle.color,
      backgroundColor: computedStyle.backgroundColor
    };

    // Remove unwanted elements outside the main article
    removeSelectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(element => {
        if (!mainArticle.contains(element)) {
          element.remove();
        }
      });
    });

    // Clean up the main article while preserving its structure
    const unwantedInArticle = mainArticle.querySelectorAll(removeSelectors.join(','));
    unwantedInArticle.forEach(element => {
      if (!element.closest('p, h1, h2, h3, h4, h5, h6')) {
        element.remove();
      }
    });

    // Restore original styles to maintain formatting
    Object.assign(mainArticle.style, originalStyles);

    // Ensure the article is visible and centered
    mainArticle.style.display = 'block';
    mainArticle.style.margin = '0 auto';
    mainArticle.style.maxWidth = '800px';
    mainArticle.style.position = 'relative';
    mainArticle.style.zIndex = '1';

    // Remove fixed positioning from headers and other elements
    document.querySelectorAll('header, nav, footer').forEach(element => {
      if (!mainArticle.contains(element)) {
        element.remove();
      }
    });

    // Remove background videos/images that might interfere
    document.querySelectorAll('video, iframe').forEach(element => {
      if (!mainArticle.contains(element)) {
        element.remove();
      }
    });

    // Ensure body scrolling is enabled
    document.body.style.overflow = 'auto';
    document.documentElement.style.overflow = 'auto';
  }
}
