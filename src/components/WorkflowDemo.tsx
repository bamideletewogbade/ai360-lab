import styles from '@/app/marketing.module.css'

export function WorkflowDemo() {
  return (
    <figure className={styles.workflowDemo} aria-labelledby="workflow-demo-title">
      <div className={styles.workflowPrompt}>
        <span>01 · Your goal</span>
        <p>“Help me launch a hibiscus drink for busy people in Accra.”</p>
      </div>
      <div className={`${styles.workflowRoute} ${styles.workflowRouteIn}`} aria-hidden="true"><i /><i /><i /></div>
      <div className={styles.workflowSystem}>
        <div className={styles.workflowSystemHead}><span><i /> AI360 is working</span><small>Right tool, automatically</small></div>
        <ol>
          <li><span>✓</span><div><b>Understand the brief</b><small>Audience, offer and outcome</small></div><em>Done</em></li>
          <li><span>2</span><div><b>Check the market</b><small>Current sources attached</small></div><em>Live</em></li>
          <li><span>3</span><div><b>Shape the campaign</b><small>Direction waits for your review</small></div><em>Next</em></li>
        </ol>
      </div>
      <div className={`${styles.workflowRoute} ${styles.workflowRouteOut}`} aria-hidden="true"><i /><i /><i /></div>
      <div className={styles.workflowDecision}>
        <span>03 · Your decision</span>
        <b>Direction ready to review</b>
        <p>Change the idea, approve it, or stop here. Nothing expensive runs on its own.</p>
        <div><span className={styles.workflowDecisionAction}>Ask for changes</span><span className={styles.workflowDecisionAction}>Approve direction</span></div>
      </div>
      <figcaption id="workflow-demo-title">A real task moves through the system visibly: your goal in, the right route chosen, your approval before production.</figcaption>
    </figure>
  )
}
