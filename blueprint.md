
# Blueprint

## Overview

This document outlines the plan for creating a Next.js application with user authentication, a dashboard, and push notifications. The application will be built using the App Router and will include features for user login, profile management, and order viewing.

## Project Structure

*   `/app`: Main application directory.
    *   `/api`: API routes.
        *   `/auth`: Authentication-related APIs.
            *   `/send-code`: API for sending authentication codes.
            *   `/verify`: API for verifying authentication codes.
        *   `/orders`: API for managing orders.
            *   `/[id]`: Dynamic API route for specific orders.
        *   `/profile`: API for user profiles.
        *   `/push`: API for push notifications.
            *   `/subscribe`: API for subscribing to push notifications.
        *   `/webhooks`: Webhook endpoints.
            *   `/retailcrm`: Webhook for RetailCRM integration.
        *   `/cron`: Cron job endpoints.
            *   `/sync`: Cron job for data synchronization.
    *   `/dashboard`: Dashboard page.
    *   `/login`: Login page.
*   `/components`: Reusable React components.
*   `/lib`: Utility functions and libraries.

## Features

*   **User Authentication:**
    *   Login page for users to authenticate.
    *   API routes for sending and verifying authentication codes.
*   **Dashboard:**
    *   Protected route accessible only to authenticated users.
    *   Displays user-specific information.
*   **Profile Management:**
    *   Component for users to view and edit their profiles.
    *   API for updating user profiles.
*   **Order Viewing:**
    *   API for fetching order details.
*   **Push Notifications:**
    *   Service for handling push notifications.
    *   API for subscribing to push notifications.
*   **Integrations:**
    *   Webhook for integrating with RetailCRM.
*   **Scheduled Tasks:**
    *   Cron job for periodic data synchronization.

## Design and Styling

*   **Component Library:** Tailwind CSS will be used for styling.
*   **Layout:** A consistent layout will be used across the application.
*   **Responsiveness:** The application will be responsive and work on different screen sizes.

## Current Task

*   Set up the basic project structure.
*   Create placeholder files for all routes and components.
*   Create the `blueprint.md` file.
