package socket

import (
	"errors"
	"github.com/go-gost/x/config"
	parser "github.com/go-gost/x/config/parsing/limiter"
	"github.com/go-gost/x/registry"
	"strings"
)

func createCLimiter(req createCLimiterRequest) error {
	name := strings.TrimSpace(req.Data.Name)
	if name == "" {
		return errors.New("climiter name is required")
	}
	req.Data.Name = name

	if registry.ConnLimiterRegistry().IsRegistered(name) {
		return errors.New("climiter " + name + " already exists")
	}

	v := parser.ParseConnLimiter(&req.Data)

	if err := registry.ConnLimiterRegistry().Register(name, v); err != nil {
		return errors.New("climiter " + name + " already exists")
	}

	config.OnUpdate(func(c *config.Config) error {
		c.CLimiters = append(c.CLimiters, &req.Data)
		return nil
	})

	return nil
}

func updateCLimiter(req updateCLimiterRequest) error {

	name := strings.TrimSpace(req.Limiter)

	if !registry.ConnLimiterRegistry().IsRegistered(name) {
		return errors.New("climiter " + name + " not found")
	}

	req.Data.Name = name

	v := parser.ParseConnLimiter(&req.Data)

	registry.ConnLimiterRegistry().Unregister(name)

	if err := registry.ConnLimiterRegistry().Register(name, v); err != nil {
		return errors.New("climiter " + name + " already exists")
	}

	config.OnUpdate(func(c *config.Config) error {
		for i := range c.CLimiters {
			if c.CLimiters[i].Name == name {
				c.CLimiters[i] = &req.Data
				break
			}
		}
		return nil
	})

	return nil
}

func deleteCLimiter(req deleteCLimiterRequest) error {

	name := strings.TrimSpace(req.Limiter)

	if !registry.ConnLimiterRegistry().IsRegistered(name) {
		return errors.New("climiter " + name + " not found")
	}
	registry.ConnLimiterRegistry().Unregister(name)

	config.OnUpdate(func(c *config.Config) error {
		limiters := c.CLimiters
		c.CLimiters = nil
		for _, s := range limiters {
			if s.Name == name {
				continue
			}
			c.CLimiters = append(c.CLimiters, s)
		}
		return nil
	})

	return nil
}

type createCLimiterRequest struct {
	Data config.LimiterConfig `json:"data"`
}

type updateCLimiterRequest struct {
	Limiter string               `json:"limiter"`
	Data    config.LimiterConfig `json:"data"`
}

type deleteCLimiterRequest struct {
	Limiter string `json:"limiter"`
}
