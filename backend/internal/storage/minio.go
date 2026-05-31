package storage

import (
	"context"
	"fmt"
	"io"
	"time"

	"github.com/alib/crm/config"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

type MinIOClient struct {
	client   *minio.Client
	bucket   string
	endpoint string
	useSSL   bool
}

func NewMinIOClient(cfg *config.Config) (*MinIOClient, error) {
	client, err := minio.New(cfg.MinIOEndpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.MinIOAccessKey, cfg.MinIOSecretKey, ""),
		Secure: cfg.MinIOUseSSL,
	})
	if err != nil {
		return nil, fmt.Errorf("minio init: %w", err)
	}

	mc := &MinIOClient{
		client:   client,
		bucket:   cfg.MinIOBucket,
		endpoint: cfg.MinIOEndpoint,
		useSSL:   cfg.MinIOUseSSL,
	}

	if err := mc.ensureBucket(); err != nil {
		return nil, err
	}

	return mc, nil
}

func (m *MinIOClient) ensureBucket() error {
	ctx := context.Background()
	exists, err := m.client.BucketExists(ctx, m.bucket)
	if err != nil {
		return fmt.Errorf("check bucket: %w", err)
	}
	if !exists {
		if err := m.client.MakeBucket(ctx, m.bucket, minio.MakeBucketOptions{}); err != nil {
			return fmt.Errorf("create bucket: %w", err)
		}
		// Make bucket public-read
		policy := fmt.Sprintf(`{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"AWS":["*"]},"Action":["s3:GetObject"],"Resource":["arn:aws:s3:::%s/*"]}]}`, m.bucket)
		m.client.SetBucketPolicy(ctx, m.bucket, policy)
	}
	return nil
}

func (m *MinIOClient) Upload(ctx context.Context, objectKey string, reader io.Reader, size int64, contentType string) (string, error) {
	_, err := m.client.PutObject(ctx, m.bucket, objectKey, reader, size, minio.PutObjectOptions{
		ContentType: contentType,
	})
	if err != nil {
		return "", fmt.Errorf("upload: %w", err)
	}
	return m.PublicURL(objectKey), nil
}

func (m *MinIOClient) Download(ctx context.Context, objectKey string) ([]byte, error) {
	obj, err := m.client.GetObject(ctx, m.bucket, objectKey, minio.GetObjectOptions{})
	if err != nil {
		return nil, fmt.Errorf("get object: %w", err)
	}
	defer obj.Close()
	return io.ReadAll(obj)
}

func (m *MinIOClient) PresignedURL(ctx context.Context, objectKey string, expiry time.Duration) (string, error) {
	u, err := m.client.PresignedGetObject(ctx, m.bucket, objectKey, expiry, nil)
	if err != nil {
		return "", err
	}
	return u.String(), nil
}

func (m *MinIOClient) PublicURL(objectKey string) string {
	scheme := "http"
	if m.useSSL {
		scheme = "https"
	}
	return fmt.Sprintf("%s://%s/%s/%s", scheme, m.endpoint, m.bucket, objectKey)
}

func (m *MinIOClient) Delete(ctx context.Context, objectKey string) error {
	return m.client.RemoveObject(ctx, m.bucket, objectKey, minio.RemoveObjectOptions{})
}
