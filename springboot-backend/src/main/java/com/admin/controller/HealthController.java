package com.admin.controller;

import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Container health check endpoint.
 */
@RestController
@RequestMapping("/test")
@CrossOrigin
public class HealthController {

    @GetMapping("/status")
    public String status() {
        return "ok";
    }
}
