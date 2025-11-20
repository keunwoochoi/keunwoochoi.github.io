# making seoulunderground.live

My freedom started after my last day at Genentech, Oct 10. Everything has a price tag, so I decided to pay for my freedom by vibecoding for free. The equation is not working quite well, because Cursor is not free.. But I did it anyway. 

Although Diablo 2 Resurrected as well as other things didn't help, after 2 weeks of vibing, I launch my first ever web service - [seoulunderground.live](https://seoulunderground.live/seoul/jazz/). Yes!! 

As you can tell if you clicked it, which you should, it shows the jazz show information happening in over 70 jazz venues in South Korea. Its data is automatically updated everyday. It is also a low-cost; it uses very little LLM calls and hosted without DB on github for free. (The downside is that I need to keep my macbook turned on,.. which I do anyway.)

## Why this website?

![seoulunderground.live - front page (events)](blog/img/sul/sul-event-table.png)

I'm a big jazz fan and love going to jazz shows where I live - New York - or Seoul - where I'm from and I still visit often. But it took me years to really learn about different venues and musicians and to follow jazz musicians on instagram, to finally be able to discover good shows easily and successfully. It sucks! It takes time and effort, to be there, and still you have open instagram, check out Stories, with other random Stories, and oh nice this show looks cool! uh oh the post is 23 hr ago and the show was yesterday. Ugh. This is actually a problem I wanted to solve ever since I was a college student. So yeah, I had a strong personal reason.

Why then choose something for personal reason, instead of something potentially more.. impactful in money or anything? Influenced by [@levelsio](https://x.com/levelsio) and [his book](https://readmake.com/?ref=xshop), I actually liked that this is for me. I am the user, I know the frustration, I can judge the solution. This makes the whole process uncomparably faster and more accurate, as well as more fun. 

Finally, [my blog post about Seoul's music scene](https://keunwoochoi.github.io/post.html?id=2025-09-08-seoul-small-stages) turned out to be really helpful for the ISMIR 2025 attendees. So - there seems demand, something I can potentially address. 

## Philosophy - minimizing human labor in the ETL & deployment

I absolutely don't want to visit 70+ instagram accounts and add the event details manually. I also didn't buy any idea asking the musicians or venues to submit schedules to me. Why would they? Why would they start doing it when I got nothing? What if they don't continue? No no no, that's too risky. I didn't want any human dependency on my service. 

I also needed to design it so that my work is minimized on maintenance. I.. can't work on this for too long, and it just has to work without my involvement. This means:

- Automate everything: data ingestion, analysis, deployment
- No manual fix: When there's wrong information on the schedule, fix the prompt and improve the pipeline. 

## Basically, Instagram + Gemini

> "Just crawl the instagram posts, analyze it using a vision LLM, save it, show it. Boom!"

That's it.. ish. [Ensta](https://github.com/diezo/Ensta) is a pretty reliable Python package. I mean, it's amazing! There are paid services basically crawling pages, but my scale is relatively small; I just need to crawl as many as the jazz venues in Korea, which is perhaps up to ~100. I `git clone` this into my seoulunderground repo so that Cursor could see the code. I actually haven't looked into `Ensta` codebase at all. 

Gemini - similar; I already have some nice wrapper I (let cursor) implemented for [TalkPlayData 2](https://huggingface.co/datasets/talkpl-ai/TalkPlayData-2). Just copy-paste some of the snippets and Cursor (Back then, GPT-5 because it was new and I wanted to try) did it all. 


## Enhance Venue Gemini

Gemini can use Google Maps as a tool, and that's a game changer for me. Venues have various ways to (mis)use the Instagram profiles and its fields, which is all fair because at the end, they're for human readers and as long as people can understand it, that's it. But that means I had to clarify Gemini that the Ensta-parsed profile information is rather free-form information, e.g. "address" field may have working hours, or really anything! Fortunately, Gemini API already includes Google Maps API and I didn't have to do anything else (e.g. setting up Google Maps API keys, set payment, etc..). 

## Enhance Venue by Naver Map

Even visitors in South Korea uses Naver Map, since that's de facto (ish) map service there. I didn't want the users of sul (**S**eoul**U**nderground.**L**ive) to feel like they're using poorly translated and localized website. It should be perfectly natural for Koreans! So, I had to add a link to the venue from Naver Map. 

I checked out their APIs. Um, I wasn't impressed. I ended up just crawling it using Selenium, which I did by just copy-paste some examples from the web. That's how we have Naver Map links! 

![seoulunderground.live - venues](blog/img/sul/sul-venues.png)

The overall ETL pipeline for the venue information is like this.

```
                                                                    
+-----------+      +------------------+      +------------------+
| Instagram |----->|   Fetch Profile  |----->|  Gemini Analyze  |
| (Profile) |      | (Raw JSON/HTML)  |      | (Type, Location) |
+-----------+      +------------------+      +------------------+
                                                      |          
                                                      v          
                                             +------------------+
                                             |  Gemini Enrich   |
                                             | (Google Maps API)|
                                             +------------------+
                                                      |          
                                                      v          
                                             +------------------+
                                             |   Naver Search   |
                                             | (Add'l Metadata) |
                                             +------------------+
                                                      |          
                                                      v          
                                             +------------------+
                                             | Import Masters   |
                                             | (Venue DB Rows)  |
                                             +------------------+
```

## Many Iterations of Prompts
Compare to the venue thread, the event thread might look simpler.
```
+-----------+      +------------------+      +------------------+
| Instagram |----->|   Fetch Posts    |----->|  Gemini Extract  |
| (Timeline)|      | (Images/Captions)|      | (Date, Lineup)   |
+-----------+      +------------------+      +------------------+
```

In reality, I perhaps have gone through 40-50 updates on the prompts. Gemini has to:

- Decide if it is about a jazz event or not
  - Or - decides if it has multiple jazz events or not
    - In one image, or in a multiple images
- Find the date, time, musician names
- Find musicians' ig handles if possible

In doing so, sometimes it is necessary to know additional information about the venue e.g. when they open and when is their show time depending on the day of the week. So that is part of the prompt, too.

Finally, there can be multiple posts for the same events. The data import code should determine if an event already exists or not, based on the venue, time, and the show / musician name. The real world is so fuzzy!

## Cheapest possible deployment

Although this is my hobby project, it was important choose the cheapest possible option for everything. That makes the whole thing (testing, prototyping, manitenance) more purely enjoyable because I wouldn't think about the cost. So, this is how I'm doing.

- I paid $2.57 for the URL. From year 2, it will be $26.26/year.
- I use GitHub Actions ~$6/mo, which is under free usage limit.
- The website is hosted in another, separate, and [public website repo](https://github.com/seoulunderground-live/seoulunderground-live.github.io). So.. it's for free.
- For the website deployment, I use a custom runner, which runs on my laptop; which is also the Database server. It is definitely the easiest solution.
- The website is static. The data is stored in a single json file per language, ~600KB. (I was motivated by [levels.fyi's blog post](https://www.levels.fyi/blog/scaling-to-millions-with-google-sheets.html) about deploying everything in a single json + Google sheets.)

## Descope and focus

It is tempting to extend this to other genres and cities. As long as I collect some IG handles, it should work! Right? Hm, yes perhaps.. I'm not really sure.

Different genres have different music scenes. Say, would electronic party goers would have the same problems -- that it sucks to check out Instagram to get information? Maybe, at least to some extent. But what if there's already a working solution? What if they don't like such a concept and rather spend time checking out a much better designed posters? What if what matters to them is the venue itself while caring less about who performs? Do they even call it "performing"? This reminds me of the advantage I had by choosing the genre & the problem I am familiar with. I'm actually testing [an Electronic version](https://seoulunderground.live/seoul/electronic/en) of sul, but not really investing on it (yet), for all these reasons. 

Perhaps other cities x jazz might work better. But here we go, not all the cities are the same - in Seoul, majority of the jazz venues just opened in the last few years. It is relatively a new thing, and when they started the business, Instagram is the best platform to connect with users. That's why almost every jazz venues in Korea use Instagram, and that's why just by covering Instagram, I'm covering nearly everything.

NYC is not like that! That means.. that means my big beautiful ETL is not enough, i.e. the expansion beyond Seoul & Jazz is not effortless.

## Other features
**ETL**:
- The pipeline is optimized with different cool time for different modules
- All the prompts and its parts are versioned and managed accordingly
- Automatic data snapshot with retention strategy
- It collects a potential jazz bar's handle in a separate text file for my review

**Frontend**:
- It has a "card" view (with details) and a "table" view (a summary) for different types of visitors
- It supports multilingual search by venue and event descriptions
- It shuffles 🇬🇧 and 🇺🇸 emojis for "English" button.. for fun
- The venue card connects to the event list for the selected venue
- It shows musicians's ig handles if available

**Deployment**:
- CI for all the tests / test deployment for the frontend

## Future Works

I learned a lot by doing all of these by myself! A full-cycle of product that requires a multi-dimensional thoughts, concerns, developments, reviews, repeats. I could finish this and refine the product to the current state because I really care. Jazz fans in Korea are really using my service, and I'm so proud of this already.

I, uh, still have to post the daily show images to my [@seoulunderground.live](https://www.instagram.com/seoulunderground.live/) account, which is annoying! Although the screenshots are taken and the images are synced to my phone automatically, according to my plan, I shouldn't need to do this.

I wanted to solve this by using fb/ig API. Wow, they are not great. So poorly documented, and at the end - sort of conservative by now allowing my account to give the API access at all, because it's not an LLC! I'm still debating if I should spend 4-digit money to register this to a NY LLC only to enable the automatic posting.

What I really want is not only posting but also sending the schedule to ig Story, with tagging musicians' handles. That would (I guess) make musicians proud of themselves as they're "featured" on sul, make them re-post it, and organically advertise my account. I see it a must, but fb/ig API doesn't support to this anyway.

The conclusion is, an vision-LLM agent that executes "iPhone Mirroring" app and does all the jobs above. But.. 

But I'm afraid that'd require another sabbatical of mine.. 


2025.11.20.

Keunwoo
