package handlers

import (
	"net/http"

	"github.com/alib/crm/internal/auth"
	"github.com/alib/crm/internal/middleware"
	"github.com/alib/crm/internal/models"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type AuthHandler struct {
	db        *gorm.DB
	jwtSecret string
}

func NewAuthHandler(db *gorm.DB, jwtSecret string) *AuthHandler {
	return &AuthHandler{db: db, jwtSecret: jwtSecret}
}

type loginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var user models.User
	if err := h.db.Where("email = ? AND active = true", req.Email).First(&user).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	if !user.CheckPassword(req.Password) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	token, err := auth.GenerateToken(&user, h.jwtSecret)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not generate token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token": token,
		"user": gin.H{
			"id":    user.ID,
			"name":  user.Name,
			"email": user.Email,
			"role":  user.Role,
		},
	})
}

func (h *AuthHandler) Me(c *gin.Context) {
	claims, _ := c.Get(middleware.UserKey)
	userClaims := claims.(*auth.Claims)

	var user models.User
	if err := h.db.First(&user, userClaims.UserID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"id":    user.ID,
		"name":  user.Name,
		"email": user.Email,
		"role":  user.Role,
		"phone": user.Phone,
	})
}

func (h *AuthHandler) Logout(c *gin.Context) {
	// JWT stateless — клиент просто удаляет токен
	c.JSON(http.StatusOK, gin.H{"message": "logged out"})
}
