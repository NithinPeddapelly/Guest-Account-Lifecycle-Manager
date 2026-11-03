Frontend

This is the dashboard for the Nextcloud Guest Lifecycle Manager.

The idea is to have one place where we can see guest accounts and manage their access without having to check everything manually in Nextcloud.

I'm keeping the frontend relatively simple for now. The main focus of the project is the backend and the lifecycle management logic, so the dashboard just needs to make those features easy to use and demonstrate how everything works together.

What we're planning

- Guest list — View guest accounts and their access information.
- Access review — Review guests and decide whether to keep, renew or revoke their access.
- History — View previous lifecycle management actions.

These features will be added as the backend API becomes available.

Development

The frontend will use React with Vite.