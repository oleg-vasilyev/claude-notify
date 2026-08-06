BeforeAll {
  . (Join-Path $PSScriptRoot '..\src\notify-core.ps1')
}

Describe 'Get-ProjectKey' {
  It 'reads the project from a [proj] prefix' {
    Get-ProjectKey '[job-finder] waiting for approval' | Should -Be 'job-finder'
  }
  It 'reads the project from a machine-labeled [proj@home] prefix' {
    Get-ProjectKey '[FoolProof@home] question pending' | Should -Be 'FoolProof'
  }
  It 'falls back to global when there is no prefix' {
    Get-ProjectKey 'no prefix at all' | Should -Be 'global'
  }
  It 'falls back to global for an empty message' {
    Get-ProjectKey '' | Should -Be 'global'
  }
  It 'sanitizes characters that cannot live in a file name' {
    Get-ProjectKey '[my proj!] hello' | Should -Be 'my_proj_'
  }
}

Describe 'Add-MachineLabel' {
  It 'inserts the label into a [proj] prefix' {
    Add-MachineLabel '[job-finder] waiting' 'home' | Should -Be '[job-finder@home] waiting'
  }
  It 'prefixes an unlabeled message with the bare label' {
    Add-MachineLabel 'waiting for you' 'work' | Should -Be '[work] waiting for you'
  }
  It 'leaves an already labeled message alone' {
    Add-MachineLabel '[proj@home] waiting' 'home' | Should -Be '[proj@home] waiting'
  }
  It 'leaves the message alone when the label is empty' {
    Add-MachineLabel '[proj] waiting' '' | Should -Be '[proj] waiting'
  }
}

Describe 'Get-DeliveryDecision' {
  BeforeAll {
    $script:now = [datetime]'2026-08-06 12:00:00'
  }

  It 'queues while the user is active' {
    Get-DeliveryDecision -IdleSeconds 10 -MinIdleMinutes 3 -RateLimitMinutes 0 -LastSentAt $null -Now $now |
      Should -Be 'queue'
  }
  It 'sends once the user has been idle long enough' {
    Get-DeliveryDecision -IdleSeconds 200 -MinIdleMinutes 3 -RateLimitMinutes 0 -LastSentAt $null -Now $now |
      Should -Be 'send'
  }
  It 'never queues when the idle check is disabled' {
    Get-DeliveryDecision -IdleSeconds 0 -MinIdleMinutes 0 -RateLimitMinutes 0 -LastSentAt $null -Now $now |
      Should -Be 'send'
  }
  It 'skips inside the rate-limit window' {
    Get-DeliveryDecision -IdleSeconds 999 -MinIdleMinutes 3 -RateLimitMinutes 10 -LastSentAt $now.AddMinutes(-5) -Now $now |
      Should -Be 'skip-rate-limit'
  }
  It 'sends again once the rate-limit window has passed' {
    Get-DeliveryDecision -IdleSeconds 999 -MinIdleMinutes 3 -RateLimitMinutes 10 -LastSentAt $now.AddMinutes(-11) -Now $now |
      Should -Be 'send'
  }
  It 'ignores the stamp when rate limiting is off' {
    Get-DeliveryDecision -IdleSeconds 999 -MinIdleMinutes 3 -RateLimitMinutes 0 -LastSentAt $now.AddSeconds(-1) -Now $now |
      Should -Be 'send'
  }
  It 'prefers the queue over the rate limit while the user is active' {
    Get-DeliveryDecision -IdleSeconds 10 -MinIdleMinutes 3 -RateLimitMinutes 10 -LastSentAt $now.AddMinutes(-5) -Now $now |
      Should -Be 'queue'
  }
  It 'treats a broken idle probe as away, not as present' {
    Get-DeliveryDecision -IdleSeconds ([int]::MaxValue) -MinIdleMinutes 3 -RateLimitMinutes 0 -LastSentAt $null -Now $now |
      Should -Be 'send'
  }
}

Describe 'Select-PendingDelivery' {
  BeforeAll {
    $script:now = [datetime]'2026-08-06 12:00:00'
    function Line([datetime]$At, [string]$Message) {
      $At.ToString('o') + '|' + $Message
    }
  }

  It 'delivers a fresh message' {
    $r = Select-PendingDelivery -Lines @(Line $now.AddMinutes(-5) '[a] hello') -Now $now -StaleMinutes 15
    $r.Deliver | Should -Be @('[a] hello')
    $r.Dropped | Should -BeNullOrEmpty
  }
  It 'drops a stale message and reports it' {
    $r = Select-PendingDelivery -Lines @(Line $now.AddMinutes(-20) '[a] old') -Now $now -StaleMinutes 15
    $r.Deliver | Should -BeNullOrEmpty
    $r.Dropped.Count | Should -Be 1
    $r.Dropped[0].Message | Should -Be '[a] old'
  }
  It 'keeps the most informative message per project' {
    $lines = @(
      (Line $now.AddMinutes(-2) '[a] short'),
      (Line $now.AddMinutes(-1) '[a] a much longer and more useful message')
    )
    $r = Select-PendingDelivery -Lines $lines -Now $now -StaleMinutes 15
    $r.Deliver | Should -Be @('[a] a much longer and more useful message')
  }
  It 'delivers one message per project' {
    $lines = @(
      (Line $now.AddMinutes(-2) '[a] first project'),
      (Line $now.AddMinutes(-1) '[b] second project')
    )
    $r = Select-PendingDelivery -Lines $lines -Now $now -StaleMinutes 15
    $r.Deliver.Count | Should -Be 2
  }
  It 'dedupes across the plain and machine-labeled forms of one project' {
    $lines = @(
      (Line $now.AddMinutes(-2) '[a] generic ping'),
      (Line $now.AddMinutes(-1) '[a@home] a contextual ping from the model itself')
    )
    $r = Select-PendingDelivery -Lines $lines -Now $now -StaleMinutes 15
    $r.Deliver | Should -Be @('[a@home] a contextual ping from the model itself')
  }
  It 'skips malformed lines' {
    $r = Select-PendingDelivery -Lines @('no separator here', '') -Now $now -StaleMinutes 15
    $r.Deliver | Should -BeNullOrEmpty
    $r.Dropped | Should -BeNullOrEmpty
  }
  It 'keeps a message whose timestamp cannot be parsed' {
    $r = Select-PendingDelivery -Lines @('garbage|[a] still worth delivering') -Now $now -StaleMinutes 15
    $r.Deliver | Should -Be @('[a] still worth delivering')
  }
  It 'handles an empty queue' {
    $r = Select-PendingDelivery -Lines @() -Now $now -StaleMinutes 15
    $r.Deliver | Should -BeNullOrEmpty
  }
}
