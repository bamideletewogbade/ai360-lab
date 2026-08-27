import type { PackId } from '@/lib/studio/packs'

export type MarketCategory = 'study' | 'career' | 'create' | 'business' | 'decide'

export type MarketProduct = {
  id: string
  packId: PackId
  name: string
  promise: string
  description: string
  category: MarketCategory
  format: 'Study kit' | 'Career kit' | 'Creator kit' | 'Business kit' | 'Quick tool' | 'Decision tool'
  tags: string[]
  /** Seeds the real Project brief so a catalogue choice keeps its purpose. */
  starterPrompt: string
  featured?: boolean
}

/**
 * The first Market shelf only contains things AI360 can run today. Keeping the
 * workflow id beside each listing makes it difficult for the storefront to
 * drift into a collection of attractive but non-functional promises.
 */
export const MARKET_PRODUCTS: MarketProduct[] = [
  {
    id: 'exam-study-plan',
    packId: 'learn',
    name: 'Prepare for an exam',
    promise: 'Turn your syllabus and deadline into a realistic study plan.',
    description: 'Break the subject into priorities, get clear study material, practice activities and a schedule you can follow.',
    category: 'study',
    format: 'Study kit',
    tags: ['student', 'exam', 'revision', 'study plan', 'university', 'undergrad'],
    starterPrompt: 'Help me prepare for an exam. Ask for my subject, syllabus or topics, exam date, current confidence and available study time, then create a focused learning and revision plan.',
    featured: true,
  },
  {
    id: 'assignment-research',
    packId: 'research',
    name: 'Research an assignment',
    promise: 'Find credible sources and shape your own argument.',
    description: 'Build a sourced research brief, key evidence and an outline while keeping the thinking and final submission yours.',
    category: 'study',
    format: 'Study kit',
    tags: ['student', 'assignment', 'essay', 'sources', 'research', 'undergrad'],
    starterPrompt: 'Help me research an assignment without doing dishonest academic work for me. Ask for the question, course level, required sources and deadline, then build a sourced research brief and outline I can develop myself.',
  },
  {
    id: 'final-year-project',
    packId: 'plan',
    name: 'Plan a final-year project',
    promise: 'Turn a broad project idea into manageable milestones.',
    description: 'Clarify the objective, scope, research needs, supervisor checkpoints and weekly next steps from proposal to submission.',
    category: 'study',
    format: 'Study kit',
    tags: ['student', 'final year', 'capstone', 'thesis', 'dissertation', 'project'],
    starterPrompt: 'Help me plan my final-year or capstone project. Ask for my programme, idea, requirements, deadline and supervisor expectations, then create a practical project path with milestones and next actions.',
  },
  {
    id: 'scholarship-application',
    packId: 'write',
    name: 'Apply for a scholarship',
    promise: 'Tell your story clearly without sounding generic.',
    description: 'Shape your evidence, personal statement and supporting answers around the opportunity and its selection criteria.',
    category: 'study',
    format: 'Study kit',
    tags: ['student', 'scholarship', 'personal statement', 'application', 'funding'],
    starterPrompt: 'Help me prepare a scholarship application in my authentic voice. Ask for the opportunity, criteria, my experience and draft material, then help structure and refine the statement and supporting answers.',
  },
  {
    id: 'cv-job-application',
    packId: 'write',
    name: 'Build a strong job application',
    promise: 'Turn your experience into a focused CV and cover letter.',
    description: 'Match your real skills, school work and experience to a role—even when you are applying for your first proper job.',
    category: 'career',
    format: 'Career kit',
    tags: ['new grad', 'graduate', 'CV', 'resume', 'cover letter', 'job', 'internship'],
    starterPrompt: 'Help me create a truthful, tailored job application. Ask for the role, job description, education, projects, skills and experience, then prepare a focused CV and cover letter without inventing claims.',
    featured: true,
  },
  {
    id: 'interview-prep',
    packId: 'learn',
    name: 'Prepare for an interview',
    promise: 'Practise likely questions and make your examples stronger.',
    description: 'Understand the role, prepare truthful STAR stories, rehearse difficult questions and know what to ask the interviewer.',
    category: 'career',
    format: 'Career kit',
    tags: ['new grad', 'interview', 'job', 'internship', 'STAR', 'practice'],
    starterPrompt: 'Help me prepare for a job interview. Ask for the role, organisation, job description and my background, then create likely questions, truthful STAR practice and useful questions to ask.',
  },
  {
    id: 'career-direction',
    packId: 'decide',
    name: 'Choose a career direction',
    promise: 'Compare realistic paths using your strengths and constraints.',
    description: 'Explore possible roles or industries, compare the trade-offs and leave with a small experiment instead of a vague answer.',
    category: 'career',
    format: 'Career kit',
    tags: ['student', 'new grad', 'career path', 'jobs', 'skills', 'decision'],
    starterPrompt: 'Help me compare realistic career directions. Ask about my interests, strengths, education, location, constraints and goals, then compare options and recommend a low-risk next experiment.',
  },
  {
    id: 'first-90-days',
    packId: 'plan',
    name: 'Plan my first 90 days',
    promise: 'Start a new role with a clear learning and contribution plan.',
    description: 'Map the people, skills, early wins and check-ins that help a young professional settle in and build trust.',
    category: 'career',
    format: 'Career kit',
    tags: ['young professional', 'new job', 'first 90 days', 'onboarding', 'career'],
    starterPrompt: 'Help me plan my first 90 days in a new role. Ask about the role, organisation, expectations and what I need to learn, then create milestones, relationship priorities and practical early wins.',
  },
  {
    id: 'portfolio-plan',
    packId: 'plan',
    name: 'Build a portfolio project',
    promise: 'Create proof of your skills with something worth showing.',
    description: 'Choose a focused project, define the audience and scope, then plan the work and the story your portfolio will tell.',
    category: 'create',
    format: 'Creator kit',
    tags: ['student', 'new grad', 'portfolio', 'personal project', 'creative', 'skills'],
    starterPrompt: 'Help me plan a portfolio project that proves a skill. Ask what role or opportunity I want, what I can do, my available time and preferred format, then define the project, milestones and presentation plan.',
  },
  {
    id: 'business-starter',
    packId: 'launch',
    name: 'Start a business',
    promise: 'Go from an idea to a brand and launch plan.',
    description: 'Shape the offer, brand direction, campaign, WhatsApp copy and launch materials in one guided project.',
    category: 'business',
    format: 'Business kit',
    tags: ['SME', 'brand', 'launch', 'Ghana', 'WhatsApp'],
    starterPrompt: 'Help me take a business idea from concept to launch. Ask about the customer, problem, offer, location, budget and goals, then build the brand and launch project.',
    featured: true,
  },
  {
    id: 'name-domain',
    packId: 'naming',
    name: 'Name and domain check',
    promise: 'Find a strong name you can actually own.',
    description: 'Generate reasoned name options, check real domain availability and suggest matching social handles.',
    category: 'business',
    format: 'Quick tool',
    tags: ['name', 'domain', 'handles', 'business'],
    starterPrompt: 'Help me find a strong name and available domain. Ask what I am naming, who it serves, the desired feeling, location and any naming constraints.',
    featured: true,
  },
  {
    id: 'marketing-push',
    packId: 'marketing',
    name: 'Grow my business',
    promise: 'Build a practical campaign for an existing brand.',
    description: 'Get a campaign plan, channel-ready copy, a four-week posting calendar and clear measures of success.',
    category: 'business',
    format: 'Business kit',
    tags: ['marketing', 'campaign', 'sales', 'WhatsApp', 'social media'],
    starterPrompt: 'Help me build a practical marketing campaign for an existing business. Ask about the brand, customer, offer, goal, channels, timing and budget.',
    featured: true,
  },
  {
    id: 'month-of-content',
    packId: 'calendar',
    name: 'A month of content',
    promise: 'Know what to post for the next four weeks.',
    description: 'Create a usable posting calendar with captions and timing guidance for a brand that already exists.',
    category: 'create',
    format: 'Creator kit',
    tags: ['content', 'calendar', 'captions', 'Instagram', 'TikTok'],
    starterPrompt: 'Help me create a useful month of content. Ask what I create or promote, who it is for, my channels, voice, goals and what I can realistically publish.',
  },
  {
    id: 'ads-ready-to-test',
    packId: 'ads',
    name: 'Ads ready to test',
    promise: 'Write several ad directions before spending money.',
    description: 'Produce platform-ready headline and body variants, audience notes and a sensible first test.',
    category: 'business',
    format: 'Quick tool',
    tags: ['ads', 'copy', 'campaign', 'testing'],
    starterPrompt: 'Help me prepare ads worth testing. Ask about the offer, audience, platform, proof, budget and conversion goal before creating variants and a first test plan.',
  },
  {
    id: 'funding-pitch',
    packId: 'pitch',
    name: 'Pitch my business',
    promise: 'Explain the opportunity clearly and confidently.',
    description: 'Prepare a one-page summary, spoken pitch, answers to hard questions and a follow-up email.',
    category: 'business',
    format: 'Business kit',
    tags: ['pitch', 'funding', 'investor', 'partner', 'sales'],
    starterPrompt: 'Help me prepare a clear business pitch. Ask about the audience, problem, solution, traction, business model, ask and supporting evidence.',
  },
  /**
   * Skills discovery is deliberately the first business listing rather than a
   * career one. Most people arriving at "I want a side hustle" cannot name what
   * they are able to sell, and every listing after this one assumes they can.
   */
  {
    id: 'find-my-skill',
    packId: 'discover',
    name: 'Find what you can sell',
    promise: 'Work out what you are already good at before deciding what to start.',
    description: 'A guided interview about work you have actually done — paid, unpaid, family or church — and an honest read on which of it people pay for here.',
    category: 'business',
    format: 'Business kit',
    tags: ['side hustle', 'skills', 'start', 'Ghana', 'strengths', 'interview', 'discover'],
    starterPrompt: 'Help me work out what I am actually good at, so I can decide what to sell. Ask me about specific things I have done — at work, at school, at home, at church, helping family or friends — including unpaid work. Ask which of them I enjoyed and which drained me. Then tell me honestly what skills the evidence shows, where those skills earn money in Ghana, and one small thing I could test this month.',
    featured: true,
  },
  {
    id: 'side-hustle-start',
    packId: 'sidehustle',
    name: 'Start a side hustle',
    promise: 'Earn on the side without giving up your job or your studies.',
    description: 'Check whether anyone will actually pay, what it costs to start, and how to fit the work into the hours you really have.',
    category: 'business',
    format: 'Business kit',
    tags: ['side hustle', 'small business', 'Ghana', 'part time', 'capital', 'students'],
    starterPrompt: 'Help me start a side hustle I can run alongside my job or studies. Ask what I can do, how many hours a week I genuinely have, how much money I can risk losing, where I am based and who I already know. Then check who would pay and what they pay now, work out my startup cost and break-even, and give me a week-by-week plan plus the first messages to send.',
    featured: true,
  },
  {
    id: 'price-my-work',
    packId: 'decide',
    name: 'Decide what to charge',
    promise: 'Set a price you can defend and still make money on.',
    description: 'Work out your real cost per job, compare what others charge locally, and settle on a price with the trade-offs visible.',
    category: 'business',
    format: 'Decision tool',
    tags: ['pricing', 'charge', 'rates', 'profit', 'Ghana', 'freelance', 'side hustle'],
    starterPrompt: 'Help me decide what to charge. Ask what I sell, how long each job takes, what my materials, transport and data cost, what others nearby charge, and who my customer is. Then work out my true cost per job, compare realistic price levels, and recommend a price with the reasoning I can use when someone pushes back.',
  },
  {
    id: 'sell-on-whatsapp',
    packId: 'marketing',
    name: 'Sell on WhatsApp',
    promise: 'Turn a status and a contact list into actual orders.',
    description: 'Plan what to post to status, how to run a broadcast list without being blocked, and what to say when someone finally replies.',
    category: 'business',
    format: 'Business kit',
    tags: ['WhatsApp', 'status', 'broadcast', 'sales', 'Ghana', 'Mobile Money', 'orders'],
    starterPrompt: 'Help me sell properly on WhatsApp. Ask what I sell, who is already in my contacts, how I take payment and delivery, and what I have tried so far. Then plan a week of status posts, a broadcast approach that does not get me blocked or reported, the replies to send when someone asks the price, and how to close an order.',
  },
  {
    id: 'creator-brand',
    packId: 'launch',
    name: 'Start a page worth following',
    promise: 'Decide what your page is about before you post anything.',
    description: 'Choose your subject, your angle and your look, then get the first posts that set the tone.',
    category: 'create',
    format: 'Creator kit',
    tags: ['creator', 'TikTok', 'Instagram', 'page', 'niche', 'brand', 'start'],
    starterPrompt: 'Help me start a page or channel worth following. Ask what I know or care about, who I want watching, which platform I will actually use, how often I can post and what I have already made. Then help me choose a clear subject and angle, a voice and look I can keep up, and the first posts that show people what the page is.',
    featured: true,
  },
  {
    id: 'short-form-scripts',
    packId: 'write',
    name: 'Scripts for short videos',
    promise: 'Stop freezing when the camera is already on.',
    description: 'Turn one idea into tight scripts with a hook, a middle worth staying for and an ending that earns the follow.',
    category: 'create',
    format: 'Creator kit',
    tags: ['TikTok', 'Reels', 'Shorts', 'script', 'hook', 'video', 'creator'],
    starterPrompt: 'Help me write scripts for short videos. Ask what my page is about, who watches, the platform, how long the videos should be and what I want people to do at the end. Then write several scripts with a hook in the first three seconds, a clear middle and an ending that earns a follow — with the words I would actually say out loud, not written English.',
  },
  {
    id: 'brand-deals',
    packId: 'pitch',
    name: 'Get paid by brands',
    promise: 'Approach a business properly instead of waiting to be found.',
    description: 'Build a media kit from the numbers you really have, then pitch it — including what to say about rates.',
    category: 'create',
    format: 'Creator kit',
    tags: ['creator', 'brand deal', 'sponsorship', 'media kit', 'rates', 'pitch'],
    starterPrompt: 'Help me approach brands for paid work. Ask about my page, my real follower and view numbers, my audience, what I have done before and which businesses I want to work with. Then build an honest media kit, a message to send, answers to the hard questions about my numbers, and how to talk about rates without underselling myself.',
  },
  {
    id: 'one-idea-many-posts',
    packId: 'calendar',
    name: 'Turn one idea into a week of posts',
    promise: 'Get a week out of the single idea you already have.',
    description: 'Take one thing worth saying and split it across formats and days so it does not become one post and silence.',
    category: 'create',
    format: 'Creator kit',
    tags: ['content', 'repurpose', 'creator', 'week', 'posts', 'consistency'],
    starterPrompt: 'Help me turn one idea into a week of posts. Ask what the idea is, which platforms I use, my voice and how much I can realistically publish. Then break it into a week of posts across formats — short video, carousel, text, story — each with the hook and the caption, so one idea carries the whole week.',
  },
  {
    id: 'research-brief',
    packId: 'research',
    name: 'Research a market',
    promise: 'Understand a topic using current, sourced evidence.',
    description: 'Bring a market, customer or opportunity question and receive findings, sources and practical implications.',
    category: 'decide',
    format: 'Decision tool',
    tags: ['research', 'market', 'sources', 'customer'],
    starterPrompt: 'Help me research a market, customer or opportunity using current, credible evidence. Ask for the decision this research needs to support, scope, location and constraints.',
  },
  {
    id: 'compare-options',
    packId: 'decide',
    name: 'Compare and decide',
    promise: 'Make a difficult choice with the trade-offs visible.',
    description: 'Set the criteria, compare realistic options and turn the recommendation into a clear next step.',
    category: 'decide',
    format: 'Decision tool',
    tags: ['compare', 'decision', 'options', 'planning'],
    starterPrompt: 'Help me make a difficult decision. Ask for the options, criteria, constraints, deadline and what matters most, then compare the trade-offs and recommend a next step.',
  },
]

export function filterMarketProducts(products: MarketProduct[], category: 'all' | MarketCategory, query: string) {
  const normalized = query.trim().toLocaleLowerCase()
  return products.filter((product) => {
    if (category !== 'all' && product.category !== category) return false
    if (!normalized) return true
    return [product.name, product.promise, product.description, product.format, ...product.tags]
      .join(' ')
      .toLocaleLowerCase()
      .includes(normalized)
  })
}
