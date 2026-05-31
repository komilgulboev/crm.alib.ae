package middleware

import (
	"net/http"
	"strings"

	"github.com/alib/crm/internal/auth"
	"github.com/alib/crm/internal/models"
	"github.com/gin-gonic/gin"
)

const UserKey = "user_claims"

func Auth(jwtSecret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing token"})
			return
		}
		claims, err := auth.ParseToken(strings.TrimPrefix(header, "Bearer "), jwtSecret)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			return
		}
		c.Set(UserKey, claims)
		c.Next()
	}
}

func RequireRoles(roles ...models.Role) gin.HandlerFunc {
	allowed := make(map[models.Role]bool, len(roles))
	for _, r := range roles {
		allowed[r] = true
	}
	return func(c *gin.Context) {
		claims, _ := c.Get(UserKey)
		if claims == nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}
		userClaims := claims.(*auth.Claims)
		if !allowed[userClaims.Role] {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "insufficient permissions"})
			return
		}
		c.Next()
	}
}
