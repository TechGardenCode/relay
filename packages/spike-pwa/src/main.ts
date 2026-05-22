import { bootstrapApplication } from '@angular/platform-browser';

import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';

bootstrapApplication(AppComponent, appConfig).catch((err) => {
  // The bootstrap surface is the only place where errors aren't caught by
  // Angular's own zone — surface them to the console so a phone debugger
  // attached over Tailscale still sees them.
  console.error(err);
});
