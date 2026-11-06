import { linkProps } from "../router";

export function NotFoundPage() {
  return (
    <div class="page">
      <div class="empty-state" style="padding-top:80px">
        <h1>Page not found</h1>
        <p>The admin page you requested does not exist.</p>
        <a class="button" {...linkProps("/")}>Back to dashboard</a>
      </div>
    </div>
  );
}
